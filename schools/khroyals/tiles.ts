/** The Apps page's tile pictures for this school (assets/apps/); a tile without one shows its icon. */
export const TILES = {
  activities: require('./assets/apps/activities.png'),
  assignments: require('./assets/apps/assignments.png'),
  calendar: require('./assets/apps/calendar.png'),
  carline: require('./assets/apps/carline.png'),
  handbook: require('./assets/apps/handbook.png'),
  market: require('./assets/apps/market.png'),
  news: require('./assets/apps/news.png'),
  questions: require('./assets/apps/questions.png'),
  student: require('./assets/apps/student.png'),
  teachers: require('./assets/apps/teachers.png'),
  volunteer: require('./assets/apps/volunteer.png'),
} as Partial<Record<'activities' | 'assignments' | 'calendar' | 'carline' | 'handbook' | 'market' | 'news' | 'questions' | 'student' | 'teachers' | 'volunteer', number>>;
