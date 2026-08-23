/* Pure analytics: all score comparisons occur inside a single course timeline first. */
window.Revisions = window.Revisions || {};

(() => {
  const R = window.Revisions;
  const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const byDate = (a, b) => `${a.date}|${a.createdAt || a.id}`.localeCompare(`${b.date}|${b.createdAt || b.id}`);
  const inRange = (date, range) => (!range?.from || date >= range.from) && (!range?.to || date <= range.to);
  const normalized = (session) => session.maxScore > 0 ? session.score / session.maxScore * 20 : null;
  const numeric = (value) => Number.isFinite(value) ? value : null;
  const trend = (last, previous, count) => {
    if (!count) return 'unworked';
    if (count === 1 || previous == null) return 'new';
    if (last > previous) return 'up';
    if (last < previous) return 'down';
    return 'stable';
  };

  function sessionsForCourse(data, courseId, range) {
    return data.sessions.filter((session) => session.courseId === courseId && inRange(session.date, range)).sort(byDate);
  }
  function courseStats(data, courseId, range) {
    const course = data.courses.find((item) => item.id === courseId);
    const sessions = sessionsForCourse(data, courseId, range);
    const scores = sessions.map(normalized).filter(Number.isFinite);
    const first = scores[0] ?? null;
    const last = scores.at(-1) ?? null;
    const previous = scores.length > 1 ? scores.at(-2) : null;
    return {
      course, sessions, scores, count: scores.length, first, last, previous,
      totalProgress: scores.length > 1 ? last - first : null,
      lastChange: scores.length > 1 ? last - previous : null,
      best: scores.length ? Math.max(...scores) : null,
      average: average(scores),
      gapToBest: scores.length ? Math.max(...scores) - last : null,
      trend: trend(last, previous, scores.length)
    };
  }
  function subjectStats(data, subjectId, range) {
    const subject = data.subjects.find((item) => item.id === subjectId);
    const courseStatsList = data.courses.filter((course) => course.subjectId === subjectId).map((course) => courseStats(data, course.id, range));
    const worked = courseStatsList.filter((stats) => stats.count);
    const progressed = worked.filter((stats) => stats.totalProgress != null);
    const current = average(worked.map((stats) => stats.last));
    const first = average(worked.map((stats) => stats.first));
    const progress = average(progressed.map((stats) => stats.totalProgress));
    const historicalAverage = average(worked.map((stats) => stats.average));
    const ordered = [...worked].sort((a, b) => b.last - a.last);
    return {
      subject, courses: courseStatsList, worked, sessions: worked.reduce((sum, stats) => sum + stats.count, 0),
      current, first, progress, historicalAverage, courseCount: data.courses.filter((course) => course.subjectId === subjectId).length,
      workedCourseCount: worked.length, bestCourse: ordered[0] || null, weakestCourse: ordered.at(-1) || null,
      trend: progress == null ? (worked.length ? 'new' : 'unworked') : progress > 0 ? 'up' : progress < 0 ? 'down' : 'stable'
    };
  }
  function globalStats(data, range) {
    const courses = data.courses.map((course) => courseStats(data, course.id, range));
    const worked = courses.filter((stats) => stats.count);
    const subjects = data.subjects.map((subject) => subjectStats(data, subject.id, range));
    const workedSubjects = subjects.filter((stats) => stats.worked.length);
    const progressedSubjects = workedSubjects.filter((stats) => stats.progress != null);
    const progressCourses = worked.filter((stats) => stats.totalProgress != null);
    const current = average(worked.map((stats) => stats.last));
    const progression = average(progressCourses.map((stats) => stats.totalProgress));
    const highestSubject = [...workedSubjects].sort((a, b) => b.current - a.current)[0] || null;
    const weakestSubject = [...workedSubjects].sort((a, b) => a.current - b.current)[0] || null;
    const mostImproved = [...progressedSubjects].sort((a, b) => b.progress - a.progress)[0] || null;
    const mostDeclined = [...progressedSubjects].sort((a, b) => a.progress - b.progress)[0] || null;
    return {
      courses, subjects, worked, workedSubjects, current, progression,
      courseCount: data.courses.length, subjectCount: data.subjects.length,
      sessionCount: data.sessions.filter((session) => inRange(session.date, range)).length,
      highestSubject, weakestSubject, mostImproved, mostDeclined,
      trend: progression == null ? (worked.length ? 'new' : 'unworked') : progression > 0 ? 'up' : progression < 0 ? 'down' : 'stable'
    };
  }
  function courseHistory(data, courseId, range) {
    return sessionsForCourse(data, courseId, range).map((session, index, entries) => {
      const score = normalized(session);
      const previous = index ? normalized(entries[index - 1]) : null;
      return { ...session, normalized: score, change: previous == null ? null : score - previous };
    });
  }
  /* At each session date, calculate the average of the most recent score of every known course. */
  function aggregateHistory(data, range, scope) {
    const allowedCourses = scope?.subjectId ? new Set(data.courses.filter((course) => course.subjectId === scope.subjectId).map((course) => course.id)) : null;
    const entries = data.sessions.filter((session) => (!allowedCourses || allowedCourses.has(session.courseId)) && inRange(session.date, range)).sort(byDate);
    const latestByCourse = new Map();
    return entries.map((entry) => {
      latestByCourse.set(entry.courseId, normalized(entry));
      return { date: entry.date, value: average([...latestByCourse.values()]), activeCourses: latestByCourse.size, id: entry.id };
    });
  }
  function priorityCourses(data, range) {
    return data.courses.map((course) => {
      const stats = courseStats(data, course.id, range);
      if (!stats.count) return { course, stats, priority: 9, reason: 'Pas encore travaillé' };
      const targetGap = course.targetScore != null ? Math.max(0, course.targetScore - stats.last) : 0;
      const priority = (20 - stats.last) * .55 + (stats.trend === 'down' ? 5 : stats.trend === 'stable' ? 1.5 : 0) + targetGap * .6 + (stats.count < 2 ? 2 : 0);
      let reason = stats.trend === 'down' ? 'Baisse lors de la dernière session' : stats.last < 12 ? 'Dernière note à consolider' : targetGap > 0 ? `Écart de ${targetGap.toFixed(1)} avec l'objectif` : stats.trend === 'stable' ? 'Niveau à faire progresser' : 'À entretenir';
      return { course, stats, priority, reason };
    }).sort((a, b) => b.priority - a.priority);
  }

  R.analytics = { average, normalized, inRange, sessionsForCourse, courseStats, subjectStats, globalStats, courseHistory, aggregateHistory, priorityCourses, trend, numeric };
})();
