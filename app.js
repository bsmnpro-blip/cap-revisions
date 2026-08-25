(() => {
  const R = window.Revisions;
  const A = R.analytics;
  const $ = (selector) => document.querySelector(selector);
  const view = $('#view');
  const state = {
    data: R.store.load(), period: 'all', customRange: { from: '', to: '' },
    courseFilters: { search: '', subject: 'all', trend: 'all', sort: 'name', direction: 'asc' },
    historyFilters: { subject: 'all', course: 'all', type: 'all', trend: 'all' },
    toastTimer: null, dialog: null
  };

  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[character]);
  const formatNumber = (value, digits = 1) => value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: Number.isInteger(value) ? 0 : 1 }).format(value);
  const formatScore = (value) => value == null ? '—' : `${formatNumber(value)} / 20`;
  const formatDelta = (value, blank = '—') => value == null || !Number.isFinite(value) ? blank : `${value > 0 ? '+' : ''}${formatNumber(value)}`;
  const formatDate = (date) => date ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`)) : '—';
  const shortDate = (date) => date ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(new Date(`${date}T12:00:00`)) : '—';
  const titleDate = (date) => date ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00`)) : '—';
  const trendLabels = { up: 'Hausse', down: 'Baisse', stable: 'Stable', new: 'Nouveau', unworked: 'Non travaillé' };
  const trendIcons = { up: '↗', down: '↘', stable: '→', new: '•', unworked: '—' };
  const deltaMarkup = (value, kind) => `<span class="delta ${kind || (value > 0 ? 'up' : value < 0 ? 'down' : 'stable')}">${kind === 'new' ? '● Nouveau' : kind === 'unworked' ? '—' : `${value > 0 ? '↗' : value < 0 ? '↘' : '→'} ${esc(formatDelta(value, '0'))}`}</span>`;
  const trendMarkup = (kind) => `<span class="trend-badge ${kind}">${trendIcons[kind]} ${trendLabels[kind]}</span>`;
  const getSubject = (id) => state.data.subjects.find((subject) => subject.id === id);
  const getCourse = (id) => state.data.courses.find((course) => course.id === id);
  const subjectName = (id) => getSubject(id)?.name || 'Matière supprimée';
  const courseName = (id) => getCourse(id)?.name || 'Cours supprimé';
  const save = () => R.store.save(state.data);
  const today = R.today;

  function rangeForPeriod() {
    if (state.period === 'all') return undefined;
    if (state.period === 'custom') return { from: state.customRange.from || undefined, to: state.customRange.to || undefined };
    const now = new Date(`${today()}T12:00:00`);
    const iso = (date) => date.toISOString().slice(0, 10);
    if (state.period === 'today') return { from: today(), to: today() };
    if (state.period === 'year') return { from: `${now.getFullYear()}-01-01`, to: today() };
    const amount = state.period === '7d' ? 6 : state.period === '30d' ? 29 : 90;
    now.setDate(now.getDate() - amount);
    return { from: iso(now), to: today() };
  }
  function periodDescription() {
    const labels = { all: 'depuis le début', today: "aujourd'hui", '7d': 'sur 7 jours', '30d': 'sur 30 jours', '3m': 'sur 3 mois', year: 'cette année', custom: 'sur la période choisie' };
    return labels[state.period];
  }
  function route() {
    const raw = decodeURIComponent(location.hash.replace(/^#/, '') || 'dashboard');
    const [name, id] = raw.split(':');
    return { name, id };
  }
  function navigate(name, id) { location.hash = `${name}${id ? `:${encodeURIComponent(id)}` : ''}`; }
  function toast(message, error = false) {
    const element = $('#toast');
    element.textContent = message; element.classList.toggle('error', error); element.classList.add('visible');
    clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => element.classList.remove('visible'), 3200);
  }
  function subjectOptions(selected = '', allowEmpty = false) {
    const initial = allowEmpty ? '<option value="">Aucune</option>' : '<option value="" disabled>Choisir une matière</option>';
    return initial + state.data.subjects.map((subject) => `<option value="${esc(subject.id)}" ${subject.id === selected ? 'selected' : ''}>${esc(subject.name)}</option>`).join('');
  }
  function courseOptions(selected = '', allowEmpty = false) {
    const initial = allowEmpty ? '<option value="">Tous les cours</option>' : '<option value="" disabled>Choisir un cours</option>';
    return initial + state.data.courses.map((course) => `<option value="${esc(course.id)}" ${course.id === selected ? 'selected' : ''}>${esc(subjectName(course.subjectId))} — ${esc(course.name)}</option>`).join('');
  }
  function emptyState({ icon = '✦', title, text, actions = '' }) {
    return `<div class="empty-state"><div class="empty-symbol">${icon}</div><h2>${title}</h2><p>${text}</p><div class="empty-actions">${actions}</div></div>`;
  }
  function statCard(label, value, detail = '', small = false) {
    return `<article class="stat-card"><p class="stat-label">${label}</p><p class="stat-value ${small ? 'small' : ''}">${value}</p><p class="stat-detail">${detail}</p></article>`;
  }
  function scoreOrPending(value) { return value == null ? '<span class="muted">À venir</span>' : formatScore(value); }

  function lineChart(history, description, id = 'main') {
    if (!history.length) return `<div class="chart-empty"><div><span>⌁</span>Ajoutez des sessions pour faire apparaître la trajectoire.</div></div>`;
    const width = 760; const height = 270; const left = 39; const right = 12; const top = 12; const bottom = 31;
    const plotW = width - left - right; const plotH = height - top - bottom;
    const x = (index) => left + (history.length === 1 ? plotW / 2 : index / (history.length - 1) * plotW);
    const y = (value) => top + (20 - Math.max(0, Math.min(20, value))) / 20 * plotH;
    const points = history.map((point, index) => [x(index), y(point.value)]);
    const path = points.map(([px, py], index) => `${index ? 'L' : 'M'} ${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
    const area = `${path} L ${points.at(-1)[0].toFixed(1)} ${(top + plotH).toFixed(1)} L ${points[0][0].toFixed(1)} ${(top + plotH).toFixed(1)} Z`;
    const grid = [0, 5, 10, 15, 20].map((value) => `<line class="chart-grid" x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/><text class="chart-axis-label" x="0" y="${y(value) + 4}">${value}</text>`).join('');
    const labelIndexes = [...new Set([0, Math.floor((history.length - 1) / 2), history.length - 1])];
    const xLabels = labelIndexes.map((index) => `<text class="chart-axis-label" text-anchor="middle" x="${x(index)}" y="${height - 7}">${shortDate(history[index].date)}</text>`).join('');
    const dots = points.map(([px, py], index) => `<circle class="chart-dot" cx="${px}" cy="${py}" r="4.2"><title>${esc(titleDate(history[index].date))} — ${formatScore(history[index].value)}${history[index].activeCourses ? ` (${history[index].activeCourses} cours)` : ''}</title></circle>`).join('');
    return `<div class="chart" role="img" aria-label="${esc(description)}"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><defs><linearGradient id="fill-${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="var(--blue)" stop-opacity=".24"/><stop offset="100%" stop-color="var(--blue)" stop-opacity="0"/></linearGradient></defs>${grid}<path class="chart-area" style="fill:url(#fill-${id})" d="${area}"/><path class="chart-line" d="${path}"/>${dots}${xLabels}</svg></div>`;
  }

  function renderDashboard() {
    const range = rangeForPeriod(); const global = A.globalStats(state.data, range);
    if (!state.data.subjects.length) {
      view.innerHTML = emptyState({
        title: 'Commencez votre journal de progression', text: 'Créez une matière, puis un cours. Chaque session alimentera une courbe personnelle et des indicateurs de progression utiles.',
        actions: '<button class="primary-button" data-open-dialog="subject" type="button">＋ Ajouter une matière</button><button class="secondary-button" data-load-sample type="button">Voir un exemple</button>'
      }); return;
    }
    const priorities = A.priorityCourses(state.data, range).slice(0, 4);
    const subjectCards = global.subjects.slice().sort((a, b) => (b.current ?? -1) - (a.current ?? -1)).map((stats) => {
      const subject = stats.subject; const percentage = Math.max(0, Math.min(100, (stats.current ?? 0) * 5));
      return `<article class="subject-summary"><div class="subject-summary-top"><span class="color-dot" style="background:${esc(subject.color || '#4d72d8')}"></span><h3>${esc(subject.name)}</h3></div><p class="subject-score">${scoreOrPending(stats.current)}</p><div class="progress-track"><div class="progress-fill" style="width:${percentage}%"></div></div><div class="subject-summary-bottom"><span>${stats.workedCourseCount}/${stats.courseCount} cours travaillé${stats.workedCourseCount > 1 ? 's' : ''}</span>${stats.progress == null ? trendMarkup(stats.trend) : deltaMarkup(stats.progress)}</div><button class="link-button" data-go-subject="${esc(subject.id)}" type="button">Voir la matière</button></article>`;
    }).join('');
    view.innerHTML = `
      <section class="stat-grid" aria-label="Indicateurs globaux">
        ${statCard('Moyenne de niveau', scoreOrPending(global.current), `Dernière note de chaque cours ${periodDescription()}`)}
        ${statCard('Moyenne de toutes les notes', scoreOrPending(global.allScoresAverage), `Toutes les sessions ${periodDescription()}`)}
        ${statCard('Progression globale', global.progression == null ? trendMarkup(global.trend) : deltaMarkup(global.progression), 'Moyenne des progressions par cours')}
        ${statCard('Cours suivis', formatNumber(global.courseCount, 0), `${global.worked.length} travaillé${global.worked.length > 1 ? 's' : ''} ${periodDescription()}`)}
        ${statCard('Sessions réalisées', formatNumber(global.sessionCount, 0), `Enregistrées ${periodDescription()}`)}
      </section>
      <section class="content-grid">
        <article class="panel"><header class="panel-header"><div><h2 class="panel-title">Évolution de votre niveau global</h2><p class="panel-subtitle">Moyenne des dernières performances connues par cours</p></div><span class="muted">/20</span></header><div class="panel-body">${lineChart(A.aggregateHistory(state.data, range), 'Évolution globale au fil du temps', 'global')}</div></article>
        <article class="panel"><header class="panel-header"><div><h2 class="panel-title">🎯 Cours à revoir</h2><p class="panel-subtitle">Priorité selon niveau, tendance, objectif et régularité</p></div><button class="link-button" data-go="courses" type="button">Tout voir</button></header><div class="panel-body"><div class="priority-list">${priorities.map((item, index) => `<div class="priority-row"><span class="priority-number">${index + 1}</span><div><button class="course-link" data-go-course="${esc(item.course.id)}" type="button">${esc(item.course.name)}</button><p class="row-meta">${esc(item.reason)}</p></div><div class="row-score">${item.stats.count ? formatScore(item.stats.last) : '—'}<small>${item.stats.totalProgress == null ? trendLabels[item.stats.trend] : formatDelta(item.stats.totalProgress)}</small></div></div>`).join('') || '<p class="muted">Ajoutez un cours pour voir les priorités.</p>'}</div></div></article>
      </section>
      <div class="section-heading"><div><h2>Vos matières</h2><p>La moyenne de niveau donne le niveau actuel ; la moyenne de toutes les notes reflète l’ensemble de vos sessions.</p></div><button class="link-button" data-go="subjects" type="button">Voir toutes les matières</button></div>
      <section class="subject-summary-grid">${subjectCards}</section>`;
  }

  function renderCourses() {
    const range = rangeForPeriod(); const filter = state.courseFilters;
    let rows = state.data.courses.map((course) => ({ course, subject: getSubject(course.subjectId), stats: A.courseStats(state.data, course.id, range) }));
    const needle = filter.search.trim().toLocaleLowerCase('fr');
    if (needle) rows = rows.filter((row) => `${row.course.name} ${row.subject?.name || ''}`.toLocaleLowerCase('fr').includes(needle));
    if (filter.subject !== 'all') rows = rows.filter((row) => row.course.subjectId === filter.subject);
    if (filter.trend !== 'all') rows = rows.filter((row) => row.stats.trend === filter.trend);
    const values = { name: (row) => row.course.name, subject: (row) => row.subject?.name || '', last: (row) => row.stats.last ?? -1, progress: (row) => row.stats.totalProgress ?? -999, average: (row) => row.stats.average ?? -1, sessions: (row) => row.stats.count };
    rows.sort((a, b) => { const one = values[filter.sort](a); const two = values[filter.sort](b); const compare = typeof one === 'string' ? one.localeCompare(two, 'fr') : one - two; return filter.direction === 'asc' ? compare : -compare; });
    const sortHead = (key, label) => `<th class="sortable ${filter.sort === key ? 'selected' : ''}" data-sort="${key}">${label}${filter.sort === key ? (filter.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>`;
    view.innerHTML = `<section class="page-intro"><div><p class="eyebrow">SÉRIES INDÉPENDANTES</p><h2>Mes cours</h2><p>Chaque ligne suit l’évolution d’un même cours dans le temps. Les notes ne sont jamais comparées à celles d’un autre cours.</p></div><div class="button-set"><button class="secondary-button" data-open-dialog="subject" type="button">＋ Matière</button><button class="primary-button" data-open-dialog="course" type="button">＋ Ajouter un cours</button></div></section>
      <div class="toolbar"><div class="filter-group"><input id="courseSearch" type="search" value="${esc(filter.search)}" placeholder="Rechercher un cours…"><select id="courseSubject"><option value="all">Toutes les matières</option>${state.data.subjects.map((subject) => `<option value="${esc(subject.id)}" ${filter.subject === subject.id ? 'selected' : ''}>${esc(subject.name)}</option>`).join('')}</select><select id="courseTrend"><option value="all">Toutes les tendances</option><option value="up" ${filter.trend === 'up' ? 'selected' : ''}>↗ En hausse</option><option value="down" ${filter.trend === 'down' ? 'selected' : ''}>↘ En baisse</option><option value="stable" ${filter.trend === 'stable' ? 'selected' : ''}>→ Stable</option><option value="new" ${filter.trend === 'new' ? 'selected' : ''}>• Nouveau</option><option value="unworked" ${filter.trend === 'unworked' ? 'selected' : ''}>Non travaillé</option></select></div><span class="results-count">${rows.length} cours</span></div>
      ${rows.length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr>${sortHead('subject', 'Matière')}${sortHead('name', 'Cours')}${sortHead('last', 'Dernière note')}${sortHead('progress', 'Progression')}${sortHead('average', 'Moyenne')}${sortHead('sessions', 'Sessions')}<th>Tendance</th><th class="align-right">Actions</th></tr></thead><tbody>${rows.map(({ course, subject, stats }) => `<tr><td data-label="Matière"><span class="course-cell"><span class="color-dot" style="background:${esc(subject?.color || '#4d72d8')}"></span>${esc(subject?.name || '—')}</span></td><td data-label="Cours"><button class="course-link" data-go-course="${esc(course.id)}" type="button">${esc(course.name)}</button></td><td data-label="Dernière note">${stats.count ? formatScore(stats.last) : '<span class="muted">Pas encore travaillé</span>'}</td><td data-label="Progression">${stats.totalProgress == null ? (stats.count ? trendMarkup('new') : '—') : deltaMarkup(stats.totalProgress)}</td><td data-label="Moyenne">${stats.count ? formatScore(stats.average) : '—'}</td><td data-label="Sessions">${stats.count}</td><td data-label="Tendance">${trendMarkup(stats.trend)}</td><td data-label="Actions" class="align-right"><button class="action-button" data-edit-course="${esc(course.id)}" type="button" aria-label="Modifier le cours" title="Modifier">✎</button><button class="action-button delete" data-delete-course="${esc(course.id)}" type="button" aria-label="Supprimer le cours" title="Supprimer">×</button></td></tr>`).join('')}</tbody></table></div>` : emptyState({ icon: '⌕', title: 'Aucun cours ne correspond aux filtres', text: 'Modifiez votre recherche ou créez un premier cours.', actions: '<button class="primary-button" data-open-dialog="course" type="button">＋ Ajouter un cours</button>' })}`;
  }

  function renderSubjects() {
    const range = rangeForPeriod(); const subjects = state.data.subjects.map((subject) => A.subjectStats(state.data, subject.id, range)).sort((a, b) => (b.current ?? -1) - (a.current ?? -1));
    view.innerHTML = `<section class="page-intro"><div><p class="eyebrow">VUE AGRÉGÉE</p><h2>Mes matières</h2><p>La progression d’une matière est la moyenne des progressions de ses cours : un cours très travaillé n’écrase donc jamais les autres.</p></div><button class="primary-button" data-open-dialog="subject" type="button">＋ Ajouter une matière</button></section>
      ${subjects.length ? `<section class="course-rows">${subjects.map((stats) => { const subject = stats.subject; return `<article class="course-summary-row"><span class="color-dot" style="background:${esc(subject.color || '#4d72d8')}"></span><div><button class="subject-link" data-go-subject="${esc(subject.id)}" type="button">${esc(subject.name)}</button><div class="progress-track"><div class="progress-fill" style="width:${Math.max(0, Math.min(100, (stats.current || 0) * 5))}%"></div></div><span class="row-meta">${stats.workedCourseCount}/${stats.courseCount} cours travaillé${stats.workedCourseCount > 1 ? 's' : ''} · ${stats.sessions} session${stats.sessions > 1 ? 's' : ''}</span></div><div class="course-summary-score">${stats.current == null ? 'À venir' : formatScore(stats.current)}<small>${stats.progress == null ? trendMarkup(stats.trend) : deltaMarkup(stats.progress)}</small></div><div class="row-actions"><button class="action-button" data-edit-subject="${esc(subject.id)}" type="button" aria-label="Modifier la matière" title="Modifier">✎</button><button class="action-button delete" data-delete-subject="${esc(subject.id)}" type="button" aria-label="Supprimer la matière" title="Supprimer">×</button></div></article>`; }).join('')}</section>` : emptyState({ title: 'Ajoutez votre première matière', text: 'Une matière regroupe vos cours et permettra de visualiser leur progression globale.', actions: '<button class="primary-button" data-open-dialog="subject" type="button">＋ Ajouter une matière</button>' })}`;
  }

  function renderCourseDetail(courseId) {
    const course = getCourse(courseId); if (!course) return navigate('courses');
    const range = rangeForPeriod(); const stats = A.courseStats(state.data, courseId, range); const subject = getSubject(course.subjectId); const history = A.courseHistory(state.data, courseId, range);
    view.innerHTML = `<section class="detail-hero"><div><button class="back-link" data-go="courses" type="button">← Tous les cours</button><p class="eyebrow">${esc(subject?.name?.toUpperCase() || 'MATIÈRE')}</p><h2>${esc(course.name)}</h2><p>${course.description ? esc(course.description) : `Suivi ${periodDescription()}`}</p><div class="detail-actions"><button class="secondary-button" data-open-dialog="course" data-id="${esc(course.id)}" type="button">✎ Modifier</button><button class="danger-button" data-delete-course="${esc(course.id)}" type="button">× Supprimer</button></div></div><div class="detail-stats"><div class="detail-stat"><span>Dernière note</span><strong>${stats.count ? formatScore(stats.last) : '—'}</strong></div><div class="detail-stat"><span>Progression totale</span><strong>${stats.totalProgress == null ? trendMarkup(stats.trend) : deltaMarkup(stats.totalProgress)}</strong></div><div class="detail-stat"><span>Sessions</span><strong>${stats.count}</strong></div></div></section>
      <section class="detail-grid"><article class="panel"><header class="panel-header"><div><h3 class="panel-title">Trajectoire du cours</h3><p class="panel-subtitle">Chaque point est une session sur ${esc(course.name)}</p></div><button class="primary-button" data-open-dialog="session" data-course-id="${esc(course.id)}" type="button">＋ Session</button></header><div class="panel-body">${lineChart(history, `Progression du cours ${course.name}`, `course-${course.id.replace(/[^a-z0-9]/gi, '')}`)}</div></article><article class="panel"><header class="panel-header"><div><h3 class="panel-title">Repères</h3><p class="panel-subtitle">Calculés automatiquement</p></div></header><div class="panel-body"><div class="key-stat-list"><div class="key-stat"><span>Première note</span><strong>${stats.count ? formatScore(stats.first) : '—'}</strong></div><div class="key-stat"><span>Dernière progression</span><strong>${stats.lastChange == null ? '—' : deltaMarkup(stats.lastChange)}</strong></div><div class="key-stat"><span>Meilleure note</span><strong>${stats.count ? formatScore(stats.best) : '—'}</strong></div><div class="key-stat"><span>Moyenne</span><strong>${stats.count ? formatScore(stats.average) : '—'}</strong></div><div class="key-stat"><span>Écart au meilleur</span><strong>${stats.gapToBest == null ? '—' : formatDelta(stats.gapToBest)}</strong></div></div>${course.targetScore != null ? `<div class="target-card"><div class="target-top"><span>Objectif</span><span>${formatScore(course.targetScore)}</span></div><div class="progress-track"><div class="progress-fill" style="width:${Math.max(0, Math.min(100, (stats.last || 0) / course.targetScore * 100))}%"></div></div></div>` : ''}</div></article></section>
      <div class="section-heading"><div><h2>Historique des sessions</h2><p>Tri chronologique : les variations sont calculées par rapport à la session précédente de ce cours.</p></div></div>
      ${history.length ? historyTable(history, true) : emptyState({ icon: '＋', title: 'Ce cours n’a pas encore été travaillé', text: 'Ajoutez une première session : elle sera signalée comme « Nouveau » jusqu’à la prochaine comparaison.', actions: `<button class="primary-button" data-open-dialog="session" data-course-id="${esc(course.id)}" type="button">＋ Ajouter une session</button>` })}`;
  }

  function renderSubjectDetail(subjectId) {
    const subject = getSubject(subjectId); if (!subject) return navigate('subjects');
    const range = rangeForPeriod(); const stats = A.subjectStats(state.data, subjectId, range); const history = A.aggregateHistory(state.data, range, { subjectId });
    view.innerHTML = `<section class="detail-hero"><div><button class="back-link" data-go="subjects" type="button">← Toutes les matières</button><p class="eyebrow">MATIÈRE</p><h2>${esc(subject.name)}</h2><p>${subject.semester ? `Semestre ${esc(subject.semester)} · ` : ''}${stats.workedCourseCount} cours travaillé${stats.workedCourseCount > 1 ? 's' : ''}</p><div class="detail-actions"><button class="secondary-button" data-open-dialog="subject" data-id="${esc(subject.id)}" type="button">✎ Modifier</button><button class="danger-button" data-delete-subject="${esc(subject.id)}" type="button">× Supprimer</button></div></div><div class="detail-stats"><div class="detail-stat"><span>Moyenne actuelle</span><strong>${stats.current == null ? '—' : formatScore(stats.current)}</strong></div><div class="detail-stat"><span>Progression</span><strong>${stats.progress == null ? trendMarkup(stats.trend) : deltaMarkup(stats.progress)}</strong></div><div class="detail-stat"><span>Sessions</span><strong>${stats.sessions}</strong></div></div></section>
      <section class="detail-grid"><article class="panel"><header class="panel-header"><div><h3 class="panel-title">Progression de la matière</h3><p class="panel-subtitle">Moyenne des dernières notes disponibles par cours</p></div></header><div class="panel-body">${lineChart(history, `Progression de la matière ${subject.name}`, `subject-${subject.id.replace(/[^a-z0-9]/gi, '')}`)}</div></article><article class="panel"><header class="panel-header"><div><h3 class="panel-title">Vue d’ensemble</h3><p class="panel-subtitle">Agrégation équitable des cours</p></div></header><div class="panel-body"><div class="key-stat-list"><div class="key-stat"><span>Première moyenne</span><strong>${stats.first == null ? '—' : formatScore(stats.first)}</strong></div><div class="key-stat"><span>Moyenne historique</span><strong>${stats.historicalAverage == null ? '—' : formatScore(stats.historicalAverage)}</strong></div><div class="key-stat"><span>Meilleur cours</span><strong>${stats.bestCourse ? esc(stats.bestCourse.course.name) : '—'}</strong></div><div class="key-stat"><span>Cours le plus faible</span><strong>${stats.weakestCourse ? esc(stats.weakestCourse.course.name) : '—'}</strong></div></div></div></article></section>
      <div class="section-heading"><div><h2>Les cours de ${esc(subject.name)}</h2><p>Dernier niveau, progression individuelle et activité.</p></div><button class="primary-button" data-open-dialog="course" data-subject-id="${esc(subject.id)}" type="button">＋ Ajouter un cours</button></div>
      <section class="course-rows">${stats.courses.map((courseStats) => { const course = courseStats.course; return `<article class="course-summary-row"><span class="color-dot" style="background:${esc(subject.color || '#4d72d8')}"></span><div><button class="course-link" data-go-course="${esc(course.id)}" type="button">${esc(course.name)}</button><div class="progress-track"><div class="progress-fill" style="width:${Math.max(0, Math.min(100, (courseStats.last || 0) * 5))}%"></div></div><span class="row-meta">${courseStats.count ? `${courseStats.count} session${courseStats.count > 1 ? 's' : ''} · moyenne ${formatScore(courseStats.average)}` : 'Pas encore travaillé'}</span></div><div class="course-summary-score">${courseStats.count ? formatScore(courseStats.last) : '—'}<small>${courseStats.totalProgress == null ? trendMarkup(courseStats.trend) : deltaMarkup(courseStats.totalProgress)}</small></div></article>`; }).join('') || '<p class="muted">Aucun cours dans cette matière.</p>'}</section>`;
  }

  function historyTable(entries, showCourse = false) {
    return `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Date</th>${showCourse ? '' : '<th>Cours</th><th>Matière</th>'}<th>Note</th><th>Δ</th><th>Type</th><th>Commentaire</th><th></th></tr></thead><tbody>${entries.map((entry) => { const course = getCourse(entry.courseId); return `<tr><td data-label="Date">${formatDate(entry.date)}</td>${showCourse ? '' : `<td data-label="Cours"><button class="course-link" data-go-course="${esc(entry.courseId)}" type="button">${esc(course?.name || '—')}</button></td><td data-label="Matière">${esc(subjectName(course?.subjectId))}</td>`}<td data-label="Note">${formatScore(entry.normalized)}</td><td data-label="Variation">${entry.change == null ? '<span class="muted">—</span>' : deltaMarkup(entry.change)}</td><td data-label="Type">${esc(entry.sessionType)}</td><td data-label="Commentaire"><span class="muted">${esc(entry.comment || '—')}</span></td><td class="actions"><button class="action-button" data-edit-session="${esc(entry.id)}" type="button" aria-label="Modifier">✎</button><button class="action-button delete" data-delete-session="${esc(entry.id)}" type="button" aria-label="Supprimer">×</button></td></tr>`; }).join('')}</tbody></table></div>`;
  }

  function renderHistory() {
    const range = rangeForPeriod(); const f = state.historyFilters;
    let entries = state.data.sessions.filter((session) => A.inRange(session.date, range)).map((session) => {
      const record = A.courseHistory(state.data, session.courseId, range).find((item) => item.id === session.id);
      return record || { ...session, normalized: A.normalized(session), change: null };
    });
    if (f.subject !== 'all') entries = entries.filter((entry) => getCourse(entry.courseId)?.subjectId === f.subject);
    if (f.course !== 'all') entries = entries.filter((entry) => entry.courseId === f.course);
    if (f.type !== 'all') entries = entries.filter((entry) => entry.sessionType === f.type);
    if (f.trend !== 'all') entries = entries.filter((entry) => (entry.change == null ? 'new' : entry.change > 0 ? 'up' : entry.change < 0 ? 'down' : 'stable') === f.trend);
    entries.sort((a, b) => `${b.date}|${b.createdAt || b.id}`.localeCompare(`${a.date}|${a.createdAt || a.id}`));
    const types = [...new Set(state.data.sessions.map((session) => session.sessionType))].sort();
    view.innerHTML = `<section class="page-intro"><div><p class="eyebrow">JOURNAL CHRONOLOGIQUE</p><h2>Historique</h2><p>Retrouvez chaque session et corrigez une saisie si nécessaire. Les statistiques se mettent à jour immédiatement.</p></div><button class="primary-button" data-open-dialog="session" type="button">＋ Ajouter une session</button></section>
      <div class="toolbar"><div class="filter-group"><select id="historySubject"><option value="all">Toutes les matières</option>${state.data.subjects.map((subject) => `<option value="${esc(subject.id)}" ${f.subject === subject.id ? 'selected' : ''}>${esc(subject.name)}</option>`).join('')}</select><select id="historyCourse"><option value="all">Tous les cours</option>${state.data.courses.filter((course) => f.subject === 'all' || course.subjectId === f.subject).map((course) => `<option value="${esc(course.id)}" ${f.course === course.id ? 'selected' : ''}>${esc(course.name)}</option>`).join('')}</select><select id="historyType"><option value="all">Tous les types</option>${types.map((type) => `<option value="${esc(type)}" ${f.type === type ? 'selected' : ''}>${esc(type)}</option>`).join('')}</select><select id="historyTrend"><option value="all">Toutes les variations</option><option value="up" ${f.trend === 'up' ? 'selected' : ''}>↗ En hausse</option><option value="down" ${f.trend === 'down' ? 'selected' : ''}>↘ En baisse</option><option value="stable" ${f.trend === 'stable' ? 'selected' : ''}>→ Stable</option><option value="new" ${f.trend === 'new' ? 'selected' : ''}>• Première note</option></select></div><span class="results-count">${entries.length} session${entries.length > 1 ? 's' : ''}</span></div>
      ${entries.length ? historyTable(entries) : emptyState({ icon: '◷', title: 'Aucune session dans cette sélection', text: 'Modifiez les filtres ou ajoutez une nouvelle session.', actions: '<button class="primary-button" data-open-dialog="session" type="button">＋ Ajouter une session</button>' })}`;
  }

  function render() {
    const current = route(); const isDetail = current.name === 'course' || current.name === 'subject';
    const metadata = { dashboard: ['VOTRE TRAJECTOIRE', 'Bonjour !'], courses: ['SUIVI PAR COURS', 'Mes cours'], subjects: ['VUE PAR MATIÈRE', 'Mes matières'], history: ['JOURNAL DE TRAVAIL', 'Historique'] };
    const heading = metadata[current.name] || metadata.dashboard;
    $('#pageEyebrow').textContent = isDetail ? 'ANALYSE DÉTAILLÉE' : heading[0];
    $('#pageTitle').textContent = isDetail ? (current.name === 'course' ? getCourse(current.id)?.name || 'Cours' : getSubject(current.id)?.name || 'Matière') : heading[1];
    document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('active', link.dataset.nav === (isDetail ? `${current.name}s` : current.name)));
    if (current.name === 'courses') renderCourses(); else if (current.name === 'subjects') renderSubjects(); else if (current.name === 'history') renderHistory(); else if (current.name === 'course') renderCourseDetail(current.id); else if (current.name === 'subject') renderSubjectDetail(current.id); else renderDashboard();
    bindViewEvents();
  }

  function renderDialog(kind, values = {}) {
    const dialog = $('#entryDialog'); const title = $('#dialogTitle'); const eyebrow = $('#dialogEyebrow'); const fields = $('#dialogFields'); const submit = $('#formSubmit'); $('#formError').textContent = '';
    state.dialog = { kind, id: values.id || null };
    const field = (label, control, full = false, hint = '') => `<div class="form-field ${full ? 'full' : ''}"><label>${label}</label>${control}${hint ? `<p class="form-hint">${hint}</p>` : ''}</div>`;
    if (kind === 'subject') {
      eyebrow.textContent = values.id ? 'MODIFIER LA MATIÈRE' : 'NOUVELLE MATIÈRE'; title.textContent = values.id ? 'Modifier la matière' : 'Ajouter une matière'; submit.textContent = 'Enregistrer';
      fields.innerHTML = `<div class="form-grid">${field('Nom de la matière *', `<input name="name" maxlength="80" required value="${esc(values.name || '')}" placeholder="Ex. Médicaments" autofocus>`, true)}${field('Semestre', `<input name="semester" maxlength="20" value="${esc(values.semester || '')}" placeholder="Ex. S1">`)}${field('Couleur', `<input name="color" type="color" value="${esc(values.color || '#4d72d8')}">`)}</div>`;
    } else if (kind === 'course') {
      eyebrow.textContent = values.id ? 'MODIFIER LE COURS' : 'NOUVEAU COURS'; title.textContent = values.id ? 'Modifier le cours' : 'Ajouter un cours'; submit.textContent = 'Enregistrer';
      fields.innerHTML = `<div class="form-grid">${field('Matière *', `<select name="subjectId" required>${subjectOptions(values.subjectId || '')}</select>`, true)}${field('Nom du cours *', `<input name="name" maxlength="100" required value="${esc(values.name || '')}" placeholder="Ex. Statut juridique" autofocus>`, true)}${field('Objectif /20', `<input name="targetScore" type="number" min="0" max="20" step="0.1" value="${values.targetScore ?? ''}" placeholder="Facultatif">`)}${field('Description', `<textarea name="description" maxlength="500" placeholder="Facultatif">${esc(values.description || '')}</textarea>`)}</div>`;
    } else {
      const noCourses = !state.data.courses.length;
      eyebrow.textContent = values.id ? 'MODIFIER LA SESSION' : 'NOUVELLE SESSION'; title.textContent = values.id ? 'Modifier la session' : 'Ajouter une session'; submit.textContent = 'Enregistrer'; submit.disabled = noCourses;
      fields.innerHTML = noCourses ? `<div class="form-grid"><div class="form-field full"><p class="form-hint">Ajoutez d’abord une matière puis un cours pour enregistrer une session.</p><button class="secondary-button" type="button" data-switch-dialog="course">＋ Ajouter un cours</button></div></div>` : `<div class="form-grid">${field('Date *', `<input name="date" type="date" required value="${esc(values.date || today())}">`)}${field('Cours *', `<select name="courseId" required>${courseOptions(values.courseId || '')}</select>`)}${field('Note *', `<input name="score" type="number" min="0" step="0.01" required value="${values.score ?? ''}" placeholder="Ex. 16" autofocus>`)}${field('Barème', `<input name="maxScore" type="number" min="0.01" step="0.01" required value="${values.maxScore ?? 20}">`, false, 'Normalisé automatiquement sur 20')}${field('Type de session', `<select name="sessionType"><option ${values.sessionType === 'QCM' || !values.sessionType ? 'selected' : ''}>QCM</option><option ${values.sessionType === 'Annale' ? 'selected' : ''}>Annale</option><option ${values.sessionType === 'Révision' ? 'selected' : ''}>Révision</option><option ${values.sessionType === 'Oral' ? 'selected' : ''}>Oral</option><option ${values.sessionType === 'Autre' ? 'selected' : ''}>Autre</option></select>`)}${field('Nombre de questions', `<input name="questionCount" type="number" min="0" step="1" value="${values.questionCount ?? ''}" placeholder="Facultatif">`)}${field('Durée (minutes)', `<input name="durationMinutes" type="number" min="0" step="1" value="${values.durationMinutes ?? ''}" placeholder="Facultatif">`)}${field('Commentaire', `<textarea name="comment" maxlength="500" placeholder="Ce qui a été facile ou difficile…">${esc(values.comment || '')}</textarea>`, true)}</div>`;
    }
    dialog.showModal();
  }

  function formValues(form) { return Object.fromEntries(new FormData(form).entries()); }
  function submitDialog(form) {
    const { kind, id } = state.dialog || {}; const values = formValues(form); let error = '';
    if (kind === 'subject') { const item = R.createSubject({ ...values, id }); error = R.validateSubject(item, state.data.subjects, id); if (!error) { const index = state.data.subjects.findIndex((subject) => subject.id === id); if (index >= 0) state.data.subjects[index] = { ...state.data.subjects[index], ...item }; else state.data.subjects.push(item); } }
    if (kind === 'course') { const item = R.createCourse({ ...values, id }); error = R.validateCourse(item, state.data.subjects, state.data.courses, id); if (!error) { const index = state.data.courses.findIndex((course) => course.id === id); if (index >= 0) state.data.courses[index] = { ...state.data.courses[index], ...item }; else state.data.courses.push(item); } }
    if (kind === 'session') { const previous = state.data.sessions.find((session) => session.id === id); const item = R.createSession({ ...previous, ...values, id }); error = R.validateSession(item, state.data.courses); if (!error) { const index = state.data.sessions.findIndex((session) => session.id === id); if (index >= 0) state.data.sessions[index] = item; else state.data.sessions.push(item); } }
    if (error) { $('#formError').textContent = error; return; }
    save(); $('#entryDialog').close(); toast(kind === 'session' ? 'Session enregistrée : les indicateurs sont à jour.' : kind === 'course' ? 'Cours enregistré.' : 'Matière enregistrée.'); render();
  }

  function confirmDeleteSession(id) {
    const session = state.data.sessions.find((item) => item.id === id); if (!session) return;
    const dialog = $('#confirmDialog'); $('#confirmTitle').textContent = 'Supprimer cette session ?'; $('#confirmText').textContent = `${courseName(session.courseId)} · ${formatDate(session.date)} · ${formatScore(A.normalized(session))}. Cette action est irréversible.`;
    dialog.showModal();
    dialog.onclose = () => { if (dialog.returnValue === 'confirm') { state.data.sessions = state.data.sessions.filter((item) => item.id !== id); save(); toast('Session supprimée. Les statistiques ont été recalculées.'); render(); } dialog.onclose = null; };
  }

  function confirmDeleteCourse(id) {
    const course = getCourse(id); if (!course) return;
    const sessions = state.data.sessions.filter((session) => session.courseId === id);
    const dialog = $('#confirmDialog');
    $('#confirmTitle').textContent = 'Supprimer ce cours ?';
    $('#confirmText').textContent = sessions.length
      ? `${course.name} · ${sessions.length} session${sessions.length > 1 ? 's' : ''} associée${sessions.length > 1 ? 's' : ''}. Les sessions seront également supprimées. Cette action est irréversible.`
      : `${course.name}. Ce cours n’a aucune session associée. Cette action est irréversible.`;
    dialog.showModal();
    dialog.onclose = () => {
      if (dialog.returnValue === 'confirm') {
        state.data.courses = state.data.courses.filter((item) => item.id !== id);
        state.data.sessions = state.data.sessions.filter((session) => session.courseId !== id);
        save();
        toast('Cours supprimé. Les statistiques ont été recalculées.');
        if (route().name === 'course') navigate('courses'); else render();
      }
      dialog.onclose = null;
    };
  }

  function confirmDeleteSubject(id) {
    const subject = getSubject(id); if (!subject) return;
    const courses = state.data.courses.filter((course) => course.subjectId === id);
    const courseIds = new Set(courses.map((course) => course.id));
    const sessions = state.data.sessions.filter((session) => courseIds.has(session.courseId));
    const dialog = $('#confirmDialog');
    $('#confirmTitle').textContent = 'Supprimer cette matière ?';
    $('#confirmText').textContent = courses.length
      ? `${subject.name} · ${courses.length} cours et ${sessions.length} session${sessions.length > 1 ? 's' : ''} associée${sessions.length > 1 ? 's' : ''}. Les cours et leurs sessions seront également supprimés. Cette action est irréversible.`
      : `${subject.name}. Cette matière ne contient aucun cours. Cette action est irréversible.`;
    dialog.showModal();
    dialog.onclose = () => {
      if (dialog.returnValue === 'confirm') {
        state.data.subjects = state.data.subjects.filter((item) => item.id !== id);
        state.data.courses = state.data.courses.filter((course) => course.subjectId !== id);
        state.data.sessions = state.data.sessions.filter((session) => !courseIds.has(session.courseId));
        save();
        toast('Matière supprimée. Les statistiques ont été recalculées.');
        if (route().name === 'subject') navigate('subjects'); else render();
      }
      dialog.onclose = null;
    };
  }

  function loadSample() {
    const t = (day, index) => `2026-08-${String(day).padStart(2, '0')}T${String(9 + index).padStart(2, '0')}:00:00.000Z`;
    const droit = R.createSubject({ id: 'sample-droit', name: 'Droit', semester: 'S1', color: '#596fd8', createdAt: t(1, 0) });
    const medicines = R.createSubject({ id: 'sample-medicaments', name: 'Médicaments', semester: 'S1', color: '#15977a', createdAt: t(1, 1) });
    const pharmacology = R.createSubject({ id: 'sample-pharmaco', name: 'Pharmacologie', semester: 'S1', color: '#cb6670', createdAt: t(1, 2) });
    const courses = [
      R.createCourse({ id: 'sample-statut', subjectId: droit.id, name: 'Statut juridique', targetScore: 18, createdAt: t(1, 0) }),
      R.createCourse({ id: 'sample-generiques', subjectId: medicines.id, name: 'Génériques', targetScore: 17, createdAt: t(1, 1) }),
      R.createCourse({ id: 'sample-biosimilaires', subjectId: medicines.id, name: 'Biosimilaires', targetScore: 16, createdAt: t(1, 2) }),
      R.createCourse({ id: 'sample-princeps', subjectId: medicines.id, name: 'Princeps', targetScore: 18, createdAt: t(1, 3) }),
      R.createCourse({ id: 'sample-antibio', subjectId: pharmacology.id, name: 'Antibiotiques', targetScore: 16, createdAt: t(1, 4) }),
      R.createCourse({ id: 'sample-pk', subjectId: pharmacology.id, name: 'Pharmacocinétique', targetScore: 15, createdAt: t(1, 5) })
    ];
    const raw = [ ['sample-statut', 22, 16, 'QCM'], ['sample-statut', 23, 17, 'QCM'], ['sample-statut', 24, 14, 'Annale'], ['sample-statut', 28, 18, 'QCM'], ['sample-generiques', 22, 12, 'QCM'], ['sample-generiques', 25, 14, 'Révision'], ['sample-generiques', 30, 16, 'QCM'], ['sample-biosimilaires', 23, 13, 'QCM'], ['sample-biosimilaires', 29, 15, 'Annale'], ['sample-princeps', 24, 17, 'QCM'], ['sample-princeps', 31, 18, 'QCM'], ['sample-antibio', 22, 15, 'QCM'], ['sample-antibio', 29, 13, 'Annale'], ['sample-pk', 23, 12, 'QCM'], ['sample-pk', 30, 12, 'Révision'] ];
    state.data = { version: 1, subjects: [droit, medicines, pharmacology], courses, sessions: raw.map(([courseId, day, score, sessionType], index) => R.createSession({ id: `sample-session-${index}`, courseId, date: `2026-08-${String(day).padStart(2, '0')}`, score, maxScore: 20, sessionType, createdAt: t(day, index) })) };
    save(); toast('Données d’exemple chargées. Vous pouvez les modifier ou les supprimer.'); render();
  }

  function showDataMenu() {
    const existing = $('#dataPopover'); if (existing) { existing.remove(); return; }
    const popover = document.createElement('div'); popover.id = 'dataPopover'; popover.className = 'data-popover';
    popover.innerHTML = '<button data-export type="button">Exporter mes données (.json)</button><button data-import type="button">Importer des données</button><button data-load-sample type="button">Charger un exemple</button><button class="danger" data-reset type="button">Réinitialiser toutes les données</button><p class="form-hint" style="margin:8px 12px 2px">Les données restent dans ce navigateur. Pensez à exporter une sauvegarde régulièrement.</p><input id="importInput" type="file" accept="application/json,.json" hidden>';
    document.body.append(popover); const anchor = $('#dataMenuButton').getBoundingClientRect(); popover.style.left = `${Math.max(12, anchor.left)}px`; popover.style.bottom = `${window.innerHeight - anchor.top + 8}px`;
    setTimeout(() => document.addEventListener('click', function close(event) { if (!popover.contains(event.target) && event.target !== $('#dataMenuButton')) { popover.remove(); document.removeEventListener('click', close); } }), 0);
    popover.addEventListener('click', (event) => { const button = event.target.closest('button'); if (!button) return; if (button.dataset.export !== undefined) exportData(); if (button.dataset.import !== undefined) $('#importInput').click(); if (button.dataset.loadSample !== undefined) { const hasData = state.data.subjects.length || state.data.courses.length || state.data.sessions.length; if (!hasData || confirm('Charger les données d’exemple remplacera les données actuelles. Continuer ?')) loadSample(); } if (button.dataset.reset !== undefined && confirm('Supprimer toutes les données de cette application ? Cette action est irréversible.')) { state.data = { version: 1, subjects: [], courses: [], sessions: [] }; save(); toast('Toutes les données ont été supprimées.'); render(); } });
    $('#importInput').addEventListener('change', importData);
  }
  function exportData() { const blob = new Blob([R.store.export(state.data)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `cap-revisions-${today()}.json`; link.click(); URL.revokeObjectURL(link.href); toast('Export téléchargé.'); }
  function importData(event) { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { state.data = R.store.import(reader.result); save(); toast('Données importées.'); render(); } catch (error) { toast(error.message, true); } }; reader.readAsText(file); }

  function bindViewEvents() {
    view.querySelectorAll('[data-open-dialog]').forEach((button) => button.addEventListener('click', () => {
      const kind = button.dataset.openDialog; const id = button.dataset.id; const courseId = button.dataset.courseId; const subjectId = button.dataset.subjectId;
      const existing = id ? (kind === 'session' ? state.data.sessions.find((item) => item.id === id) : kind === 'course' ? getCourse(id) : getSubject(id)) : {};
      renderDialog(kind, { ...existing, courseId: courseId || existing?.courseId, subjectId: subjectId || existing?.subjectId });
    }));
    view.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.go)));
    view.querySelectorAll('[data-go-course]').forEach((button) => button.addEventListener('click', () => navigate('course', button.dataset.goCourse)));
    view.querySelectorAll('[data-go-subject]').forEach((button) => button.addEventListener('click', () => navigate('subject', button.dataset.goSubject)));
    view.querySelectorAll('[data-edit-session]').forEach((button) => button.addEventListener('click', () => renderDialog('session', state.data.sessions.find((item) => item.id === button.dataset.editSession))));
    view.querySelectorAll('[data-delete-session]').forEach((button) => button.addEventListener('click', () => confirmDeleteSession(button.dataset.deleteSession)));
    view.querySelectorAll('[data-edit-course]').forEach((button) => button.addEventListener('click', () => renderDialog('course', getCourse(button.dataset.editCourse))));
    view.querySelectorAll('[data-delete-course]').forEach((button) => button.addEventListener('click', () => confirmDeleteCourse(button.dataset.deleteCourse)));
    view.querySelectorAll('[data-edit-subject]').forEach((button) => button.addEventListener('click', () => renderDialog('subject', getSubject(button.dataset.editSubject))));
    view.querySelectorAll('[data-delete-subject]').forEach((button) => button.addEventListener('click', () => confirmDeleteSubject(button.dataset.deleteSubject)));
    view.querySelectorAll('[data-load-sample]').forEach((button) => button.addEventListener('click', () => { const hasData = state.data.subjects.length || state.data.courses.length || state.data.sessions.length; if (!hasData || confirm('Charger les données d’exemple remplacera les données actuelles. Continuer ?')) loadSample(); }));
    view.querySelectorAll('[data-sort]').forEach((header) => header.addEventListener('click', () => { const key = header.dataset.sort; state.courseFilters.direction = state.courseFilters.sort === key && state.courseFilters.direction === 'asc' ? 'desc' : 'asc'; state.courseFilters.sort = key; renderCourses(); bindViewEvents(); }));
    $('#courseSearch')?.addEventListener('input', (event) => { state.courseFilters.search = event.target.value; render(); });
    $('#courseSubject')?.addEventListener('change', (event) => { state.courseFilters.subject = event.target.value; render(); });
    $('#courseTrend')?.addEventListener('change', (event) => { state.courseFilters.trend = event.target.value; render(); });
    $('#historySubject')?.addEventListener('change', (event) => { state.historyFilters.subject = event.target.value; state.historyFilters.course = 'all'; render(); });
    $('#historyCourse')?.addEventListener('change', (event) => { state.historyFilters.course = event.target.value; render(); });
    $('#historyType')?.addEventListener('change', (event) => { state.historyFilters.type = event.target.value; render(); });
    $('#historyTrend')?.addEventListener('change', (event) => { state.historyFilters.trend = event.target.value; render(); });
  }

  $('#entryForm').addEventListener('submit', (event) => { event.preventDefault(); if (event.submitter?.value === 'cancel') { $('#entryDialog').close(); return; } submitDialog(event.currentTarget); });
  $('#dialogFields').addEventListener('click', (event) => { const button = event.target.closest('[data-switch-dialog]'); if (button) renderDialog(button.dataset.switchDialog); });
  $('#periodFilter').addEventListener('change', (event) => { state.period = event.target.value; $('#customPeriod').classList.toggle('hidden', state.period !== 'custom'); render(); });
  $('#applyCustomPeriod').addEventListener('click', () => { state.customRange = { from: $('#fromDate').value, to: $('#toDate').value }; if (state.customRange.from && state.customRange.to && state.customRange.from > state.customRange.to) { toast('La date de début doit précéder la date de fin.', true); return; } render(); });
  $('#fromDate').addEventListener('change', (event) => { state.customRange.from = event.target.value; }); $('#toDate').addEventListener('change', (event) => { state.customRange.to = event.target.value; });
  $('#addSessionButton').addEventListener('click', () => renderDialog('session'));
  $('#themeToggle').addEventListener('click', () => { document.body.classList.toggle('dark'); localStorage.setItem('cap-revisions:theme', document.body.classList.contains('dark') ? 'dark' : 'light'); $('#themeToggle').innerHTML = document.body.classList.contains('dark') ? '<span>☀</span> Mode clair' : '<span>◐</span> Mode sombre'; });
  $('#dataMenuButton').addEventListener('click', showDataMenu);
  $('#mobileMenu').addEventListener('click', () => { $('.sidebar').classList.add('open'); $('#mobileOverlay').classList.add('visible'); }); $('#mobileOverlay').addEventListener('click', () => { $('.sidebar').classList.remove('open'); $('#mobileOverlay').classList.remove('visible'); });
  document.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', () => { $('.sidebar').classList.remove('open'); $('#mobileOverlay').classList.remove('visible'); }));
  window.addEventListener('hashchange', render);
  if (localStorage.getItem('cap-revisions:theme') === 'dark') { document.body.classList.add('dark'); $('#themeToggle').innerHTML = '<span>☀</span> Mode clair'; }
  if (!location.hash) location.hash = 'dashboard'; else render();
})();
