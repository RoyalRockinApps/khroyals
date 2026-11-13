/** The Apps page's tile pictures for this school (assets/apps/); a tile without one shows its icon. */
export const TILES = {
  activities: require('./assets/apps/activities.png'),
  assignments: require('./assets/apps/assignments.png'),
  calendar: require('./assets/apps/calendar.png'),
  carline: require('./assets/apps/carline.png'),
  feedback: require('./assets/apps/feedback.png'),
  handbook: require('./assets/apps/handbook.png'),
  lunch: require('./assets/apps/lunch.png'),
  market: require('./assets/apps/market.png'),
  news: require('./assets/apps/news.png'),
  photos: require('./assets/apps/photos.png'),
  questions: require('./assets/apps/questions.png'),
  student: require('./assets/apps/student.png'),
  teachers: require('./assets/apps/teachers.png'),
  volunteer: require('./assets/apps/volunteer.png'),
} as Partial<Record<'activities' | 'assignments' | 'calendar' | 'carline' | 'feedback' | 'handbook' | 'lunch' | 'market' | 'news' | 'photos' | 'questions' | 'student' | 'teachers' | 'volunteer', number>>;
