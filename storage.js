/* Versioned browser storage. It is local to this browser and survives page reloads. */
window.Revisions = window.Revisions || {};

(() => {
  const R = window.Revisions;
  const KEY = 'cap-revisions:v1';
  const empty = () => ({ version: 1, subjects: [], courses: [], sessions: [] });
  const clean = (value) => ({
    version: 1,
    subjects: Array.isArray(value?.subjects) ? value.subjects : [],
    courses: Array.isArray(value?.courses) ? value.courses : [],
    sessions: Array.isArray(value?.sessions) ? value.sessions : []
  });
  R.store = {
    load() { try { return clean(JSON.parse(localStorage.getItem(KEY))); } catch { return empty(); } },
    save(data) { localStorage.setItem(KEY, JSON.stringify(clean(data))); },
    reset() { localStorage.removeItem(KEY); },
    export(data) { return JSON.stringify(clean(data), null, 2); },
    import(raw) {
      let parsed;
      try { parsed = JSON.parse(raw); } catch { throw new Error("Ce fichier n'est pas un JSON valide."); }
      if (!Array.isArray(parsed?.subjects) || !Array.isArray(parsed?.courses) || !Array.isArray(parsed?.sessions)) throw new Error('Le fichier ne contient pas les données attendues.');
      const data = clean(parsed);
      const errors = [];
      const ids = (items, label) => {
        const seen = new Set();
        items.forEach((item, index) => {
          if (!item?.id) errors.push(`${label} #${index + 1} n'a pas d'identifiant.`);
          else if (seen.has(item.id)) errors.push(`Identifiant en double dans ${label.toLowerCase()} : ${item.id}.`);
          else seen.add(item.id);
        });
        return seen;
      };
      const subjectIds = ids(data.subjects, 'Matière');
      const courseIds = ids(data.courses, 'Cours');
      ids(data.sessions, 'Session');
      data.courses.forEach((course) => {
        if (!subjectIds.has(course.subjectId)) errors.push(`Le cours « ${course.name || course.id} » référence une matière inexistante.`);
      });
      data.sessions.forEach((session) => {
        if (!courseIds.has(session.courseId)) errors.push(`La session du ${session.date || 'date inconnue'} référence un cours inexistant.`);
      });
      if (errors.length) {
        const preview = errors.slice(0, 4).join(' ');
        throw new Error(`Import refusé : ${errors.length} incohérence${errors.length > 1 ? 's' : ''} détectée${errors.length > 1 ? 's' : ''}. ${preview}${errors.length > 4 ? '…' : ''}`);
      }
      return data;
    }
  };
})();
