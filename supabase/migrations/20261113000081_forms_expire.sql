-- A form can't be signed once it's expired: closed by the school (already refused) or past its due date (from the day
-- after it's due, by the school's date). That goes for changing an answer too, and the sender can't send reminders to
-- sign it anymore. Otherwise the same as before (20261024000032_forms.sql).

create or replace function public.form_sign(p_form uuid, p_student uuid, p_agree boolean, p_answers jsonb, p_signature text)
returns public.form_responses
language plpgsql security definer set search_path = public as $$
declare f forms%rowtype; resp form_responses%rowtype; q jsonb; a text; clean jsonb := '{}';
begin
  select * into f from forms where id = p_form;
  if not found or not app.signs_form(p_form, p_student) then
    raise exception 'Only a parent of a student this form went to can sign it.' using errcode = '42501';
  end if;
  if f.status <> 'open' then raise exception 'This form is closed.'; end if;
  if f.due_on < app.school_today() then
    raise exception 'This form was due %, so it can''t be signed anymore.', to_char(f.due_on, 'Dy, Mon FMDD');
  end if;
  if p_agree is null then raise exception 'Agree or decline.'; end if;
  if char_length(trim(coalesce(p_signature, ''))) < 2 then raise exception 'Type your full name to sign.'; end if;
  for q in select value from jsonb_array_elements(f.questions) loop
    a := nullif(trim(coalesce(p_answers, '{}')->>(q->>'id')), '');
    if a is null then
      if p_agree and (q->>'required')::boolean then raise exception 'Please answer "%".', q->>'prompt'; end if;
      continue;
    end if;
    if q->>'kind' = 'yes_no' and a not in ('yes', 'no') then raise exception 'Answer "%" with yes or no.', q->>'prompt'; end if;
    if q->>'kind' = 'choice' and not (q->'options') ? a then raise exception 'Pick one of the choices for "%".', q->>'prompt'; end if;
    if char_length(a) > 500 then raise exception 'Keep answers to 500 characters.'; end if;
    clean := clean || jsonb_build_object(q->>'id', a);
  end loop;
  insert into form_responses (form_id, student_id, signed_by, agreed, answers, signature, signed_at)
  values (p_form, p_student, auth.uid(), p_agree, clean, trim(p_signature), now())
  on conflict (form_id, student_id) do update
    set signed_by = excluded.signed_by, agreed = excluded.agreed, answers = excluded.answers,
        signature = excluded.signature, signed_at = excluded.signed_at
  returning * into resp;
  return resp;
end $$;

create or replace function public.form_remind(p_form uuid) returns int
language plpgsql security definer set search_path = public as $$
declare f forms%rowtype; g record; n int := 0;
begin
  select * into f from forms where id = p_form;
  if not found or not app.runs_form(p_form) then
    raise exception 'Only whoever sent this form can send reminders.' using errcode = '42501';
  end if;
  if f.status <> 'open' then raise exception 'This form is closed.'; end if;
  if f.due_on < app.school_today() then raise exception 'This form is past due, so families can''t sign it anymore.'; end if;
  if f.reminded_at > now() - interval '1 hour' then raise exception 'A reminder went out less than an hour ago.'; end if;
  for g in select distinct gd.guardian_id from form_recipients r join guardians gd on gd.student_id = r.student_id
           where r.form_id = p_form and not app.is_family(gd.guardian_id)
             and not exists (select 1 from form_responses x where x.form_id = r.form_id and x.student_id = r.student_id) loop
    perform app.notify_user(g.guardian_id, '📝 Reminder: ' || f.title,
      'Please read and sign by ' || to_char(f.due_on, 'Dy, Mon FMDD') || '.', jsonb_build_object('formId', f.id));
    n := n + 1;
  end loop;
  update forms set reminded_at = now() where id = p_form;
  return n;
end $$;
