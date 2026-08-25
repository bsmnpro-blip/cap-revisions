/* Minimal regression tests for the examples in the specification. Run by opening tests.html. */
try {
  const R = window.Revisions;
  const assert = (condition, label) => { if (!condition) throw new Error(label); };
  const data = {
    subjects: [{ id: 'droit', name: 'Droit' }, { id: 'med', name: 'Médicaments' }],
    courses: [
      { id: 'statut', subjectId: 'droit', name: 'Statut juridique' },
      { id: 'gen', subjectId: 'med', name: 'Génériques' },
      { id: 'bio', subjectId: 'med', name: 'Biosimilaires' },
      { id: 'princeps', subjectId: 'med', name: 'Princeps' }
    ],
    sessions: [
      ['statut', '2026-08-22', 16], ['statut', '2026-08-23', 17], ['statut', '2026-08-24', 14], ['statut', '2026-08-28', 18],
      ['gen', '2026-08-22', 10], ['gen', '2026-08-23', 14],
      ['bio', '2026-08-22', 12], ['bio', '2026-08-23', 15],
      ['princeps', '2026-08-22', 16], ['princeps', '2026-08-23', 17]
    ].map(([courseId, date, score], index) => ({ id: String(index), courseId, date, score, maxScore: 20, createdAt: `2026-08-${22 + index}T10:00:00Z` }))
  };
  const stats = R.analytics.courseStats(data, 'statut');
  assert(stats.first === 16, 'Première note incorrecte');
  assert(stats.last === 18, 'Dernière note incorrecte');
  assert(stats.totalProgress === 2, 'Progression totale incorrecte');
  assert(stats.lastChange === 4, 'Dernier changement incorrect');
  assert(stats.best === 18 && stats.count === 4 && stats.trend === 'up', 'Statistiques cours incorrectes');
  const gen = R.analytics.courseStats(data, 'gen');
  assert(gen.totalProgress === 4 && stats.totalProgress === 2, 'Les cours ne sont pas indépendants');
  const medicines = R.analytics.subjectStats(data, 'med');
  assert(Math.abs(medicines.progress - (8 / 3)) < 0.0001, 'La progression matière doit moyenner les progressions des cours');

  const duplicateSubject = R.validateSubject({ id: 'new', name: ' Médicaments ' }, data.subjects, 'new');
  assert(duplicateSubject, 'Les doublons de matière doivent être détectés');
  const duplicateCourse = R.validateCourse({ id: 'new', subjectId: 'med', name: ' Génériques ', targetScore: null }, data.subjects, data.courses, 'new');
  assert(duplicateCourse, 'Les doublons de cours dans une matière doivent être détectés');
  assert(!R.validateCourse({ id: 'new', subjectId: 'droit', name: 'Génériques', targetScore: null }, data.subjects, data.courses, 'new'), 'Un cours identique dans une autre matière doit rester possible');

  const global = R.analytics.globalStats(data);
  assert(global.progression === 2.5, 'La progression globale doit agréger les cours de façon équilibrée');
  assert(global.current === 18, 'La moyenne de niveau doit prendre la dernière note de chaque cours');
  assert(Math.abs(global.allScoresAverage - 14.9) < 0.0001, 'La moyenne de toutes les notes doit inclure toutes les sessions');
  document.querySelector('#result').textContent = '✓ Tous les tests de calcul sont passés.';
} catch (error) {
  document.querySelector('#result').textContent = `✗ ${error.message}`;
  document.querySelector('#result').className = 'fail';
}
