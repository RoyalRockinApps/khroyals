/** Public API facade. Domain implementations, transport and DTOs live beside it. */
export { live } from './client';
export { errorText, isNetworkError } from './errors';
export { Abilities, GroupView, Person, GroupEvent, NewEvent, DressDay, Member, Pickup, PickupVehicle, CarlineConfig, Spot, BoardRow, Arrival, Vehicle, Sport, SportSeason, SportEventKind, SportEvent, SportRegistration, MySport, SportRsvp, SportAttendance, SportBulletin, SportChatMessage, TeamMember, Condition, Listing, MarketLine, MarketTerms, Opportunity, Signup, VolunteerEvent, VolunteerMessage, VolunteerAttendance, VolunteerInvite, InvitePerson, StaffToday, VolunteerScan, VolunteerStat, VolunteerDay, BusyLimits, ROLE_LABELS, QUESTION_TOPICS, QuestionTopic, SchoolQuestion, QuestionMessage, ParentRelation, FamilyLink, CriticalAlert, AlertAnswer, AlertStatusRow, AccessPoint, Access, CheckinStudent, SchoolCheck, CheckoutPerson, CheckoutListSummary, CheckoutList, AttendanceMark, ClassRollSummary, RollCheck, RollStudent, ClassRoll, DismissalHow, GoneHome, Staying, SubDay, SubOptions, TicketKind, TicketEvent, MyTicket, TicketSale, TicketSetup, AdmitResult, PermissionInfo, AdminPerson, AdminRole, PeopleFilter, Notice, MySettings, GroupPref, PostStats, GroupPostStat, Child, FamilyRequest, AdminStudent, AdminFamilyRequest, SimilarStudent, PickupRelationship, ApprovedPickup, ChildPickupPeople, PickupTransfer, PickupAsk, PickupTransfers, TeacherContact, TeacherConversation, ClassStudent, TeacherMessage, TeacherThread, Assignment, ChildAssignment, Section, MyCalendarItem, StudentEvent, Feedback, FeedbackWorkshop, FormQuestion, FormSignature, FormAudience, FormPayment, PaymentMethod, SchoolForm, MyForm, SentForm, FormStatus, NewForm, AdminSection, SectionStudent , RecordStudent, GradeScale, SchoolTerm, AttendanceKind, AttendanceEntry, CourseSummary, StudentRecord, StudentDashboard, CourseCategory, AssignmentStatus, CourseAssignment, CourseDetail, StudyNoteSummary, StudyNote, StudyDeck, StudyCard, CardText } from './types';
export { session, me, getUser, listUsers, signOut, hasSignIn, onAuthChange, setMockUser } from './session';
export { marketPhotoUrls } from './storage';
export { listMyGroups, listDiscoverableGroups, listHiddenGroups, listArchivedGroups, hideGroup, archiveGroup, deleteGroup, getGroup, getComments, createPost, addComment, moderatePost, toggleReaction, votePoll, updateGroupSettings, createGroup, joinGroup, leaveGroup, listMembers, setMembership, subscribeGroup } from './groups';
export { listEvents, createEvent, deleteEvent, editableCalendars, calendarSubscription, eventFile, listDressDays, saveDressDay, deleteDressDay, schoolBreaks } from './calendar';
export { listAlbums, listCategories, getAlbum, saveAlbum, saveCategory, deleteCategory, addGalleryPhotos, deleteGalleryPhoto, deleteAlbum, leaveAlbum, albumPeople, setAlbumMember, makeEventAlbum, eventAlbumId, type AlbumPerson, type GalleryAlbum, type GalleryCategory, type AlbumVisibility, type GalleryPhoto, type NewGalleryPhoto } from './gallery';
export { issueDate, listNewsletters, getNewsletter, importNewsletter, deleteNewsletter, isWritten, writeNewsletter, type NewsletterSummary, type NewsletterIssue, type NewsBlock, type Span } from './news';
export { onCarlineDuty, canManageSport, canBuyTickets, canVolunteer, isFamily, isSchoolStaff, isSubstitute, isVolunteerLead, teamAccess } from './policy';
export { myChildren, carlineToday, carlineAnnounce, myVehicles, saveVehicle, deleteVehicle, chooseVehicle, carlineCancel, carlineConfirm, carlineReopen, carlineConfig, carlineArrived, carlineBoard, carlineSetConfig, carlineOpenNow, carlineSetFestive, setPickupNumber, pickupNumbers, subscribeCarline, createCarPass, revokeCarPass } from './carline';
export { listSports, sportSchedule, mySports, mySportSchedule, sportRegistrations, followSport, saveSport, deleteSport, setSportCoach, saveSeason, deleteSeason, saveSportEvent, cancelSportEvent, deleteSportEvent, registerForSport, withdrawSportRegistration, decideSportRegistration, myRsvps, answerRsvp, eventAttendance, uploadSportPhoto, removeSportPhoto, subscribeSports, sportRoster, sportBulletins, saveBulletin, deleteBulletin, sportChat, sendSportChat, deleteSportChat, makeSportAlbum, subscribeTeam } from './activities';
export { marketTerms, acceptMarketTerms, listMarket, getListing, uploadMarketPhoto, marketPost, marketRemove, marketDibs, marketOffer, marketAnswerOffer, marketAnswerCounter, marketWithdraw, marketSelect, marketComplete, marketCancelSale, subscribeMarket } from './market';
export { listVolunteer, listVolunteerEvents, getOpportunity, volunteerPost, volunteerEventSave, volunteerEventDelete, volunteerEventReorder, volunteerSetEvent, volunteerAddSlot, setVolunteerPhoto, volunteerSayYes, volunteerInvite, volunteerInviteAnswer, volunteerInviteCancel, volunteerInvitePeople, volunteerPledge, volunteerWithdraw, volunteerDelete, volunteerSend, volunteerScan, volunteerCheckInCode, volunteerMark, volunteerStats, volunteerHistory, volunteerBusyLimits, volunteerSetBusyLimits, adminSetVolunteerLead, subscribeVolunteer } from './volunteer';
export { studentRecord, studentCourse } from './student';
export { listQuestions, latestAnswers, getQuestion, askSchool, questionReply, questionAssign, questionClose, subscribeQuestions } from './questions';
export { adminUpdateProfile, adminLinkGuardian, adminSetParentRelation, adminSetCarlineDuty, adminFamilyLinks, listAudit, permissionCatalog, adminListPeople, adminRoles, adminSaveRole, adminDeleteRole, adminSetAccess, adminSetDirector, adminDeleteUser, transferDirector } from './admin';
export { NoAccountError, sendEmailCode, authRedirectUrl, completeSignInFromUrl, verifyEmailCode, ssoProviders, signInWithGoogle, signInWithApple, mfaStatus, mfaEnroll, mfaVerify } from './auth';
export { listAlerts, myAlertAnswers, sendCriticalAlert, answerAlert, endAlert, alertStatus, shareAlertLocation, myLocationConsent, setLocationConsent, listAccessPoints, saveAccessPoint, deleteAccessPoint, importAccessPoints, subscribeAlerts } from './alerts';
export { myAccess } from './access';
export { staffToday } from './staffToday';
export {
  checkinStudents, checkinToday, schoolCheck, undoSchoolCheck, checkoutPeople, myCheckoutLists, checkoutList, checkoutEventOptions,
  checkoutMyStudents, saveCheckoutList, checkoutListForEvent, deleteCheckoutList, releaseStudent, unreleaseStudent,
} from './checkin';
export { myClassAttendance, attendanceOverview, classRoll, markAttendance } from './attendance';
export { logUsage, usageSummary, type UsageSummary } from './usage';
export { myVariant, logExperiment, experimentsList, experimentResults, setExperiment, type ExperimentSummary, type ExperimentResults } from './experiments';
export {
  myCampusStatus, campusCheck, campusCheckFor, onSiteToday, onSiteList, setDismissalTime, visitorsToday, signInVisitor, signOutVisitor,
  removeVisitor, markGoneHome, extendedCareRoster, extendedCareSearch, setExtendedCare, extendedCareStaff, setExtendedCareStaff, extendedCareList,
  type CampusStatus, type OnSiteBucket, type OnSiteToday, type OnSitePerson, type OnSiteStudent, type OnSiteList, type Visitor,
  type ExpectedVisitor, type ExtendedCareStudent, type ExtendedCareStaff,
} from './onsite';
export { mySubDays, subSchedule, subOptions, saveSubDay, deleteSubDay } from './subs';
export {
  ticketSetup, ticketsOnSale, ticketEvent, saveTicketEvent, ticketSales, admitTicket, myTickets, startTicketCheckout, ticketOrderStatus,
  cancelTicketOrder, walletLink,
} from './tickets';
export { listNotifications, myNotifications, unreadNotificationCount, subscribeNotifications, sendNotification, setNotificationPref, registerPushToken, unregisterPushToken, markNotificationsOpened, openedNotifications, notificationOpenCounts, dismissNotifications, clearMyNotifications } from './notifications';
export { deleteMyAccount, updateMyName, uploadMyAvatar, removeMyAvatar, adminClearAvatar, mySettings, updateMySettings, myGroupPrefs } from './profile';
export { recordPostViews, postStats, groupPostStats, myFollows, setPostFollow } from './stats';
export { myChildProfiles, updateChildDetails, uploadChildPhoto, removeChildPhoto, requestChild, requestChildEdit, cancelFamilyRequest, myFamilyRequests, studentLoginStatus, giveStudentLogin, removeStudentLogin, type StudentLogin } from './children';
export { adminListStudents, adminCreateStudent, adminUpdateStudent, adminDeleteStudent, adminSimilarStudents, adminFamilyRequests, adminDecideFamilyRequest } from './adminStudents';
export { childPickupPeople, addPickupPerson, removePickupPerson, myPickupChildren, pickupTransferPeople, transferPickup, answerPickupTransfer, cancelPickupTransfer, pickupTransfers } from './pickup';
export { myTeachers, teacherConversations, myClassStudents, teacherThread, teacherThreadFor, teacherSend, teacherThreadRead, subscribeTeacherMessages } from './teachers';
export { listFeedback, sendFeedback, triageFeedback, listWorkshops, saveWorkshop, deleteWorkshop } from './feedback';
export { myCalendar, studentEvents, savePersonalEvent, deletePersonalEvent, planStudentEvent } from './myCalendar';
export { studyNotes, studyNote, saveStudyNote, deleteStudyNote, studySubjects, studyDecks, studyDeck, dueStudyCards, saveStudyDeck, deleteStudyDeck, resetStudyDeck, addStudyCards, editStudyCard, deleteStudyCard, reviewStudyCard } from './study';
export { listAssignments, childAssignments, addAssignment, deleteAssignment, checkAssignment, mySections, subscribeAssignments } from './assignments';
export { removeForm, myForms, sentForms, formStatus, sendForm, signForm, remindForm, closeForm, recordPayment, clearPayment } from './forms';
export { adminListSections, adminSectionStudents, adminSaveSection, adminSectionMember, adminDeleteSection } from './classes';
export { listAbsences, reportAbsence, cancelAbsence, markAbsenceSeen, attachDoctorNote, removeDoctorNote, doctorNoteUrl, type AbsenceReport, type DoctorNoteFile } from './absences';
export {
  myFolderNotes, sentFolderNotes, sendBulletin, sendFolderNote, deleteFolderNote, readFolderNote, removeFolderNote, parentNoteTeachers, sendParentNote,
  readParentNote, parentNotes, type FolderNote, type FolderNoteKind, type SentFolderNote, type ParentNote, type ChildTeachers,
} from './folderNotes';
export { lunchWindows, saveLunchWindow, deleteLunchWindow, lunchClosedDays, closeLunchDay, lunchRules, setLunchRules, lunchKids, lunchSlots, lunchAllergyNotes, bookLunchVisit, cancelLunchVisit, myLunchVisits, lunchVisitors, type LunchWindow, type LunchSlot, type LunchKid, type MyLunchVisit, type LunchVisitor } from './lunch';
