/*!
 * script.js
 *
 * a script to make a roblox game on mobile through bookmarklets
 *
 * creates a new game from the UGC Homestore template, renames it to "[username]'s Donation Game",
 * auto-fills the maturity questionnaire (all "No"), sets the game to public
 * and redirects to the gamepass creator page once dismissed.
 *
 * note: must run on www.roblox.com (create.roblox.com CSP blocks bookmarklets).
 */

(() => {
  'use strict';

  const TEMPLATE_PLACE_ID = 110446511895848; // UGC Homestore Template (https://www.roblox.com/games/110446511895848/UGC-Homestore)
  const QUESTIONNAIRE = 'https://apis.roblox.com/experience-questionnaire/v1/';

  let csrfToken = null;

  // get x-csrf-token
  const api = async (url, options = {}) => {
    const headers = { Accept: 'application/json', ...options.headers };
    if (csrfToken) headers['x-csrf-token'] = csrfToken;

    const init = {
      method: options.method || 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers,
    };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
      headers['Content-Type'] = 'application/json';
    }

    let res = await fetch(url, init);
    if (res.status === 403 && res.headers.get('x-csrf-token')) {
      csrfToken = res.headers.get('x-csrf-token');
      headers['x-csrf-token'] = csrfToken;
      res = await fetch(url, init);
    }
    return res;
  };

  const asJson = (text) => {
    try { return JSON.parse(text); } catch { return null; }
  };

  // throw an error if any of the step fails
  const requireOk = async (res, step) => {
    if (res.ok) return;
    const text = await res.text().catch(() => '');
    const data = asJson(text) || {};
    const detail = data.errors?.[0]?.message || data.message || '';
    throw new Error(`${step} failed: HTTP ${res.status}${detail ? ' — ' + detail : ''}`);
  };

  // create a new universe from the template place
  const createUniverse = async () => {
    const res = await api('https://apis.roblox.com/universes/v1/universes/create', {
      method: 'POST',
      body: { templatePlaceId: TEMPLATE_PLACE_ID, isPublish: true },
    });
    await requireOk(res, 'Create');
    const data = asJson(await res.text());
    if (!data?.universeId) throw new Error('Create failed: unexpected response');
    return { universeId: data.universeId, placeId: data.rootPlaceId };
  };

  // change game name to "[username]'s Donation Game""
  const gameName = (autoName) =>
    /Place:/.test(autoName) ? autoName.replace(/Place:.*$/, 'Donation Game').trim() : autoName;

  const rename = async (universeId) => {
    const current = await api(`https://develop.roblox.com/v1/universes/${universeId}`);
    await requireOk(current, 'Rename');
    const name = gameName(asJson(await current.text())?.name || '');
    if (!name) throw new Error('Rename failed: universe has no name');

    const res = await api(`https://develop.roblox.com/v2/universes/${universeId}/configuration`, {
      method: 'PATCH',
      body: { name },
    });
    await requireOk(res, 'Rename');
    return name;
  };

  // get the correct option (no -> false -> first option) for the maturity questionnaire
  const cleanOption = (options) =>
    options.find((o) => /^no\b/i.test(String(o.text || '').trim())) ||
    options.find((o) => (o.metadata || {})['content-descriptor-contains'] === 'False') ||
    options[0];

  // fills up the maturity questionnaire and submits
  const fillMaturity = async (universeId) => {
    const head = await api(`${QUESTIONNAIRE}questionnaires/${universeId}/latest`);
    await requireOk(head, 'Maturity');
    const { questionnaireId } = asJson(await head.text());

    const form = await api(`${QUESTIONNAIRE}questionnaires/${questionnaireId}?localeCode=en_us`);
    await requireOk(form, 'Maturity');
    const doc = asJson(await form.text());
    const sections = doc.questionnaire?.sections || doc.sections || [];

    const answers = sections.flatMap((section) =>
      (section.questions || []).flatMap((question) => {
        const option = cleanOption(question.options || []);
        return question.id && option?.id
          ? [{ questionId: question.id, value: JSON.stringify(option.id) }]
          : [];
      }),
    );

    const submit = await api(`${QUESTIONNAIRE}responses/${universeId}/submissions`, {
      method: 'POST',
      body: { questionnaireId, response: { answers } },
    });
    await requireOk(submit, 'Maturity');
  };

  // makes the game public
  const activate = async (universeId) => {
    const res = await api(`https://develop.roblox.com/v1/universes/${universeId}/activate`, {
      method: 'POST',
    });
    await requireOk(res, 'Activate');
  };

  (async () => {
    if (window.__createGameBusy) return;
    window.__createGameBusy = true;

    try {
      const created = await createUniverse();
      const name = await rename(created.universeId);
      await fillMaturity(created.universeId);
      await activate(created.universeId);

      alert(
        `${name} created\n` +
          `universe ${created.universeId} place ${created.placeId}\n` +
          `redirecting to its passes page after dismissal...`
      );

      // opens the gamepass page
      location.href = `https://create.roblox.com/dashboard/creations/experiences/${created.universeId}/monetization/passes`;

    } catch (err) {
      alert(err?.message || err);
    }
  })();
})();
