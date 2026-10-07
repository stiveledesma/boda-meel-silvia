const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const toast = $('#toast');
const gate = $('#gate');
const body = document.body;
const song = $('#weddingSong');
const audioControl = $('#audioControl');
const audioLabel = $('#audioLabel');

function showToast(message){
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

async function startMusic(){
  try{
    await song.play();
    audioControl.classList.add('playing');
    audioLabel.textContent = 'Pausar canción';
  }catch{
    audioLabel.textContent = 'Nuestra canción';
  }
}

$('#openInvitation').addEventListener('click', async () => {
  gate.classList.add('closed');
  body.classList.remove('is-locked');
  await startMusic();
  setTimeout(() => gate.remove(), 950);
});

audioControl.addEventListener('click', async () => {
  if(song.paused){
    await startMusic();
    showToast('Música activada');
  }else{
    song.pause();
    audioControl.classList.remove('playing');
    audioLabel.textContent = 'Nuestra canción';
    showToast('Música en pausa');
  }
});

// Scroll reveal
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if(entry.isIntersecting){
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, {threshold:.12, rootMargin:'0px 0px -30px 0px'});
$$('.reveal').forEach(el => observer.observe(el));

// Countdown
const weddingDate = new Date('2027-02-14T16:00:00-05:00');
function tick(){
  const diff = Math.max(0, weddingDate - new Date());
  const d = Math.floor(diff / 86400000);
  const h = Math.floor(diff / 3600000) % 24;
  const m = Math.floor(diff / 60000) % 60;
  const s = Math.floor(diff / 1000) % 60;
  $('#days').textContent = String(d).padStart(3,'0');
  $('#hours').textContent = String(h).padStart(2,'0');
  $('#minutes').textContent = String(m).padStart(2,'0');
  $('#seconds').textContent = String(s).padStart(2,'0');
}
tick(); setInterval(tick,1000);

// Personalized pass from query string
const params = new URLSearchParams(location.search);
const guestParam = params.get('invitado');
const seatsParam = Math.max(1, Math.min(12, Number(params.get('cupos') || 2)));
if(guestParam){
  $('#guestDisplay').textContent = guestParam;
  $('#guestSeats').textContent = `Hemos reservado ${seatsParam} ${seatsParam === 1 ? 'lugar' : 'lugares'} para este pase.`;
  $('#guestName').value = guestParam;
  $('#guestCount').max = String(seatsParam);
  $('#guestCount').value = String(seatsParam);
}

// Mobile film controls
let filmIndex = 0;
const cards = $$('.film-card');
function updateFilm(){
  if(window.innerWidth <= 680){
    cards.forEach((c,i) => c.style.transform = `translateX(${-100 * filmIndex}%)`);
    $('#filmProgress').style.transform = `translateX(${filmIndex * 100}%)`;
  }else{
    cards.forEach(c => c.style.transform = '');
  }
}
$$('[data-film]').forEach(btn => btn.addEventListener('click', () => {
  filmIndex = btn.dataset.film === 'next' ? (filmIndex + 1) % cards.length : (filmIndex - 1 + cards.length) % cards.length;
  updateFilm();
}));
window.addEventListener('resize', updateFilm);

function listFromStorage(key){
  try{return JSON.parse(localStorage.getItem(key) || '[]')}catch{return []}
}
function writeList(key,items){localStorage.setItem(key, JSON.stringify(items.slice(0,6)))}
function renderWishes(){
  const items = listFromStorage('ms_wishes_v2');
  $('#wishList').innerHTML = items.map(i => `<div class="saved-note"><strong>${escapeHtml(i.name)}</strong> — ${escapeHtml(i.text)}</div>`).join('');
}
function renderSongs(){
  const items = listFromStorage('ms_songs_v2');
  $('#songList').innerHTML = items.map(i => `<div class="saved-note">♪ ${escapeHtml(i)}</div>`).join('');
}
function escapeHtml(value){
  return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

$('#wishForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#wishName').value.trim();
  const text = $('#wishText').value.trim();
  if(!name || !text) return;
  const items = listFromStorage('ms_wishes_v2');
  items.unshift({name,text});
  writeList('ms_wishes_v2',items);
  e.currentTarget.reset();
  renderWishes();
  showToast('Deseo guardado en esta demo');
});
$('#songForm').addEventListener('submit', e => {
  e.preventDefault();
  const value = $('#songInput').value.trim();
  if(!value) return;
  const items = listFromStorage('ms_songs_v2');
  items.unshift(value);
  writeList('ms_songs_v2',items);
  e.currentTarget.reset();
  renderSongs();
  showToast('Canción añadida a la demo');
});
renderWishes(); renderSongs();

$('#rsvpForm').addEventListener('submit', e => {
  e.preventDefault();
  const item = {
    name: $('#guestName').value.trim(),
    attendance: $('#attendance').value,
    count: $('#guestCount').value,
    message: $('#guestMessage').value.trim(),
    createdAt: new Date().toISOString()
  };
  if(!item.name || !item.attendance){ showToast('Completa nombre y asistencia'); return; }
  const items = listFromStorage('ms_rsvp_v2');
  items.unshift(item);
  writeList('ms_rsvp_v2',items);
  showToast('Confirmación guardada en este navegador');
});
