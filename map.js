const get = (id) => document.getElementById(id);
const feed = 'https://data.corkcity.ie/api/3/action/datastore_search?resource_id=f4677dac-bb30-412e-95a8-d3c22134e3c0&limit=100';
const freshnessMinutes = 30;
const statusLabels = { available: 'Spaces reported', limited: 'Limited', full: 'Full', unknown: 'Unavailable' };
const irelandClock = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Dublin', dateStyle: 'short', timeStyle: 'medium' });
const map = window.L ? L.map('map', { scrollWheelZoom: false }).setView([51.893, -8.474], 14) : null;
const markers = map ? L.layerGroup().addTo(map) : null;
let parks = snapshot;
let active = null;
let latestRequest = 0;

if (map) {
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
} else {
  get('map').textContent = 'Map failed to load. Car park details are still available in the list.';
}

function readAvailability(park) {
  const stamp = String(park.date ?? '').trim();
  const hasZone = /Z$|[+-]\d\d:?\d\d$/.test(stamp);
  const now = hasZone ? Date.now() : Date.parse(irelandClock.format(new Date()).replace(' ', 'T') + 'Z');
  const time = Date.parse(hasZone ? stamp : stamp.replace(' ', 'T') + 'Z');
  const age = (now - time) / 60000;
  if (!Number.isFinite(age) || age < -5) return { state: 'unknown', label: 'No recent reading' };
  if (age > freshnessMinutes) return { state: 'unknown', label: 'Stale reading' };
  const free = park.free_spaces;
  if (!Number.isInteger(free) || free < 0 || free > park.spaces) return { state: 'unknown', label: 'No space count' };
  const state = free === 0 ? 'full' : free <= 20 ? 'limited' : 'available';
  return { state, free, label: free === 0 ? 'Full · 0 spaces' : `${free} ${free === 1 ? 'space' : 'spaces'}` };
}

function element(tag, value, className) {
  const node = document.createElement(tag);
  if (value != null) node.textContent = value;
  if (className) node.className = className;
  return node;
}

function details(park) {
  const list = element('dl');
  const fields = [
    ['Total spaces', park.spaces], ['Opening hours', park.opening_times],
    ['Price', park.price], ['Height limit', park.height_restrictions], ['Notes', park.notes]
  ];
  for (const [label, value] of fields) {
    if (label === 'Notes' && !value) continue;
    list.append(element('dt', label), element('dd', value ?? 'Not provided'));
  }
  const directions = element('a', 'Get directions');
  directions.href = 'https://www.google.com/maps/dir/?api=1&destination=' +
    encodeURIComponent(`${park.latitude},${park.longitude}`);
  directions.target = '_blank';
  directions.rel = 'noopener noreferrer';
  const content = element('div');
  const stamp = park.date ? park.date.replace('T', ' ') : 'Not provided';
  content.append(list, element('p', `Source reading · ${stamp}`, 'time'), directions);
  return content;
}

function showAll() {
  if (!map) return;
  const points = markers.getLayers().map((marker) => marker.getLatLng());
  if (points.length) map.fitBounds(points, { padding: [50, 50], maxZoom: 16 });
}

function selectPark(id) {
  active = id;
  for (const card of get('parks').children) {
    card.classList.toggle('active', Number(card.dataset.id) === active);
  }
}

function render(fit = false) {
  const expanded = new Set(Array.from(document.querySelectorAll('.park details[open]'), (item) => item.parentElement.dataset.id));
  const term = get('search').value.trim().toLowerCase();
  const availableOnly = get('available').checked;
  const sort = get('sort').value;
  const list = parks.map((park) => ({ park, ...readAvailability(park) }))
    .filter(({ park, free }) => park.name.toLowerCase().includes(term) && (!availableOnly || free > 0))
    .sort((a, b) => (sort === 'free' ? (b.free ?? -1) - (a.free ?? -1) : 0) || a.park.name.localeCompare(b.park.name));

  markers?.clearLayers();
  get('parks').replaceChildren();
  get('count').textContent = `${list.length} of ${parks.length}`;
  if (!list.length) get('parks').append(element('p', 'No matching car parks.', 'empty'));

  for (const { park, state, label } of list) {
    const card = element('article', null, 'park');
    card.dataset.id = park.identifier;
    const row = element('div', null, 'row');
    const title = element('button', park.name, 'park-name');
    title.type = 'button';
    title.setAttribute('aria-label', `Show ${park.name} on map`);
    row.append(title, element('span', label, `badge ${state}`));
    const disclosure = element('details');
    disclosure.open = expanded.has(card.dataset.id);
    disclosure.append(element('summary', 'Parking details'), details(park));
    card.append(row, element('p', park.price || 'Price unavailable'), disclosure);
    get('parks').append(card);

    if (!map || !Number.isFinite(park.latitude) || !Number.isFinite(park.longitude)) {
      title.addEventListener('click', () => { disclosure.open = true; });
      title.setAttribute('aria-label', `Show details for ${park.name}`);
      continue;
    }
    const icon = L.divIcon({
      className: `parking-pin ${state}`,
      html: 'P',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
    const marker = L.marker([park.latitude, park.longitude], {
      icon, title: `${park.name} · ${label}`, alt: `${park.name} · ${label}`
    }).addTo(markers);
    marker.getElement().setAttribute('aria-label', `${park.name} · ${label}`);
    const popup = element('div', null, 'popup');
    popup.append(element('h3', park.name), element('span', `${statusLabels[state]} · ${label}`.replace('Full · Full', 'Full'), `badge ${state}`), details(park));
    marker.bindPopup(popup, { maxWidth: 290 });
    marker.on('popupopen', () => selectPark(park.identifier));
    title.addEventListener('click', () => {
      map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15));
      marker.openPopup();
      disclosure.open = true;
    });
  }
  selectPark(active);
  if (fit) showAll();
}

function loadFeed() {
  return new Promise((resolve, reject) => {
    const name = `corkParkingFeed${++latestRequest}`;
    const script = document.createElement('script');
    const finish = (callback, value) => {
      clearTimeout(timeout);
      script.remove();
      delete window[name];
      callback(value);
    };
    const timeout = setTimeout(() => finish(reject, new Error('Feed timed out')), 10000);
    window[name] = (data) => {
      const records = data?.result?.records;
      if (!data?.success || !Array.isArray(records) || !records.length ||
          records.length !== data.result.total ||
          !records.every((park) => typeof park.name === 'string' && Number.isInteger(park.identifier))) {
        finish(reject, new Error('Feed returned incomplete data'));
        return;
      }
      finish(resolve, records);
    };
    script.onerror = () => finish(reject, new Error('Feed unavailable'));
    script.src = `${feed}&callback=${name}`;
    document.head.append(script);
  });
}

async function refresh() {
  const button = get('refresh');
  if (button.disabled) return;
  button.disabled = true;
  get('status').textContent = 'Checking council feed…';
  try {
    parks = await loadFeed();
    const checked = new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    get('status').textContent = `Feed checked at ${checked}`;
  } catch {
    get('status').textContent = 'Feed unavailable · saved data';
  } finally {
    button.disabled = false;
    render();
  }
}

get('refresh').addEventListener('click', refresh);
get('reset').addEventListener('click', showAll);
get('search').addEventListener('input', () => render(true));
get('available').addEventListener('change', () => render(true));
get('sort').addEventListener('change', () => render());
render(true);
refresh();
setInterval(refresh, 60000);
