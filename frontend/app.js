const TZ = 'Asia/Jakarta'
const STATUS = { BOOKED: ['booked', 'Terjadwal'], COMPLETED: ['completed', 'Selesai'], CANCELLED: ['cancelled', 'Dibatalkan'] }
const ROLE_LABEL = { patient: 'Pasien', doctor: 'Dokter', admin: 'Administrator' }
const DEMO = [
  ['Pasien', 'pasien@klinik.id'],
  ['Dokter', 'sari@klinik.id'],
  ['Admin', 'admin@klinik.id']
]

const icons = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0"/></svg>',
  mark: '<svg viewBox="0 0 24 24"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>'
}

const state = {
  session: JSON.parse(sessionStorage.getItem('session') || 'null'),
  view: null,
  mode: 'login',
  doctors: [],
  date: null,
  board: {},
  pick: null,
  appointments: [],
  filter: 'ALL',
  notifications: { unread: 0, items: [] },
  inbox: false,
  busy: false
}

const app = document.getElementById('app')
const toastEl = document.getElementById('toast')
const dialog = document.getElementById('dialog')
let toastTimer = null
let pollTimer = null

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function toast(message, bad = false) {
  toastEl.textContent = message
  toastEl.className = `show${bad ? ' bad' : ''}`
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastEl.className = '' }, 4200)
}

function jakartaDate(offset = 0) {
  return new Date(Date.now() + offset * 86400000).toLocaleDateString('en-CA', { timeZone: TZ })
}

function parts(date) {
  const d = new Date(`${date}T12:00:00+07:00`)
  return {
    weekday: d.toLocaleDateString('id-ID', { weekday: 'short', timeZone: TZ }),
    long: d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }),
    day: d.toLocaleDateString('id-ID', { day: 'numeric', timeZone: TZ }),
    month: d.toLocaleDateString('id-ID', { month: 'short', timeZone: TZ })
  }
}

function saveSession(tokens) {
  const claims = JSON.parse(atob(tokens.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  state.session = { access: tokens.access_token, refresh: tokens.refresh_token, id: claims.sub, name: claims.name, role: claims.role, exp: claims.exp }
  sessionStorage.setItem('session', JSON.stringify(state.session))
}

function clearSession() {
  state.session = null
  sessionStorage.removeItem('session')
  clearInterval(pollTimer)
  state.view = null
  state.pick = null
  state.inbox = false
}

async function refreshTokens() {
  if (!state.session?.refresh) return false
  const res = await fetch('/auth/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: state.session.refresh })
  })
  if (!res.ok) return false
  saveSession(await res.json())
  return true
}

async function authed(url, options = {}, retry = true) {
  const res = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}), authorization: `Bearer ${state.session.access}` }
  })
  if (res.status === 401 && retry && await refreshTokens()) return authed(url, options, false)
  if (res.status === 401) {
    clearSession()
    render()
    throw new Error('Sesi berakhir, silakan masuk kembali')
  }
  return res
}

async function gql(query, variables) {
  const res = await authed('/graphql', { method: 'POST', body: JSON.stringify({ query, variables }) })
  const body = await res.json()
  if (body.errors?.length) throw new Error(body.errors[0].message)
  return body.data
}

const APPT_FIELDS = 'id patientName doctorId doctorName specialty room date slot status complaint note'

async function loadDoctors() {
  state.doctors = (await gql('{ doctors { id name specialty room days } }')).doctors
}

async function loadBoard() {
  const query = `query($d: String!) { ${state.doctors.map((d, i) => `a${i}: availability(doctorId: "${d.id}", date: $d) { time available }`).join(' ')} }`
  const data = await gql(query, { d: state.date })
  state.board = {}
  state.doctors.forEach((d, i) => { state.board[d.id] = data[`a${i}`] })
}

async function loadAppointments() {
  state.appointments = (await gql(`{ appointments { ${APPT_FIELDS} } }`)).appointments
}

async function loadNotifications() {
  const res = await authed('/notifications')
  if (res.ok) state.notifications = await res.json()
}

function startPolling() {
  clearInterval(pollTimer)
  pollTimer = setInterval(async () => {
    try {
      const before = state.notifications.unread
      await loadNotifications()
      if (state.notifications.unread !== before) {
        if (state.notifications.unread > before) toast('Ada notifikasi baru')
        if (state.view === 'mine' || state.view === 'schedule') await loadAppointments()
        render()
      }
    } catch {}
  }, 15000)
}

function defaultView() {
  return { patient: 'book', doctor: 'schedule', admin: 'all' }[state.session.role]
}

async function enter(view) {
  state.view = view
  state.pick = null
  state.inbox = false
  state.busy = true
  render()
  try {
    if (view === 'book') {
      if (!state.doctors.length) await loadDoctors()
      state.date = state.date || jakartaDate(0)
      await loadBoard()
    } else {
      await loadAppointments()
    }
    await loadNotifications()
  } catch (err) {
    toast(err.message, true)
  }
  state.busy = false
  render()
}

function navItems() {
  const role = state.session.role
  if (role === 'patient') return [['book', 'Reservasi baru', icons.plus], ['mine', 'Jadwal saya', icons.list]]
  if (role === 'doctor') return [['schedule', 'Jadwal pasien', icons.cal]]
  return [['all', 'Semua reservasi', icons.list]]
}

const TITLES = {
  book: ['Pilih jadwal praktik', 'Pilih tanggal, lalu ketuk jam yang masih kosong pada dokter yang Anda inginkan.'],
  mine: ['Jadwal saya', 'Riwayat dan reservasi aktif Anda, termasuk catatan dokter setelah pemeriksaan.'],
  schedule: ['Jadwal pasien', 'Pasien yang terdaftar pada jadwal praktik Anda.'],
  all: ['Semua reservasi', 'Pemantauan reservasi seluruh dokter. Data medis pasien tidak ditampilkan pada peran ini.']
}

function loginView() {
  const register = state.mode === 'register'
  return `
  <div class="gate">
    <section class="gate-art">
      <div class="brand"><span class="brand-mark">${icons.mark}</span>Klinik Sehat Sentosa</div>
      <div>
        <h1>Datang tepat waktu, tanpa antre panjang.</h1>
        <p>Pilih dokter dan jam praktik yang masih kosong, lalu terima konfirmasi serta pengingat sehari sebelum jadwal.</p>
      </div>
      <div class="gate-facts">
        <span>Senin sampai Sabtu, 08.00 sampai 17.00 WIB</span>
        <span>Keluhan dan catatan medis disimpan terenkripsi</span>
      </div>
    </section>
    <section class="gate-form">
      <div class="gate-card">
        <h2>${register ? 'Daftar sebagai pasien' : 'Masuk'}</h2>
        <p class="sub">${register ? 'Buat akun untuk mulai memesan jadwal.' : 'Gunakan akun Anda untuk melihat dan memesan jadwal.'}</p>
        <div id="form-error"></div>
        <form id="auth-form" novalidate>
          ${register ? '<div class="field"><label for="name">Nama lengkap</label><input id="name" name="name" autocomplete="name" required minlength="3"></div>' : ''}
          <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required></div>
          <div class="field"><label for="password">Kata sandi</label><input id="password" name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" required>${register ? '<small>Minimal 8 karakter, memuat huruf dan angka.</small>' : ''}</div>
          <button class="btn" type="submit" id="submit-btn">${register ? 'Daftar' : 'Masuk'}</button>
        </form>
        <p class="switch">${register ? 'Sudah punya akun?' : 'Belum punya akun?'} <button type="button" id="toggle-mode">${register ? 'Masuk' : 'Daftar sebagai pasien'}</button></p>
        ${register ? '' : `<div class="demo"><p>Akun contoh (kata sandi: Klinik#2026)</p><div class="chips">${DEMO.map(([label, email]) => `<button class="chip" type="button" data-demo="${email}">${label}</button>`).join('')}</div></div>`}
      </div>
    </section>
  </div>`
}

function inboxView() {
  const { items } = state.notifications
  return `<div class="inbox" id="inbox"><h3>Notifikasi</h3>${items.length ? `<ul>${items.map(n => `<li class="${n.read ? '' : 'unread'}"><strong>${esc(n.title)}</strong><p>${esc(n.message)}</p><time datetime="${esc(n.deliverAt)}">${new Date(n.deliverAt).toLocaleString('id-ID', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' })}</time></li>`).join('')}</ul>` : '<p class="none">Belum ada notifikasi.</p>'}</div>`
}

function topline() {
  const [title, sub] = TITLES[state.view]
  const unread = state.notifications.unread
  return `<header class="topline"><div><h1>${title}</h1><p>${sub}</p></div>
    <div class="bell"><button class="bell-btn" id="bell" aria-label="Notifikasi${unread ? `, ${unread} belum dibaca` : ''}" aria-expanded="${state.inbox}">${icons.bell}${unread ? `<span class="bell-count">${unread}</span>` : ''}</button>${state.inbox ? inboxView() : ''}</div></header>`
}

function boardView() {
  const days = Array.from({ length: 14 }, (_, i) => jakartaDate(i))
  const hours = state.board[state.doctors[0]?.id]?.map(s => s.time) || []
  const weekday = new Date(`${state.date}T00:00:00Z`).getUTCDay()
  const rows = state.doctors.map(d => {
    const works = d.days.includes(weekday)
    const cells = works
      ? (state.board[d.id] || []).map(s => `<div class="cell-box"><button class="cell" data-doctor="${d.id}" data-slot="${s.time}" aria-pressed="${state.pick?.doctorId === d.id && state.pick?.slot === s.time}" ${s.available ? '' : 'disabled'} aria-label="${esc(d.name)} pukul ${s.time}${s.available ? '' : ', tidak tersedia'}">${s.time}</button></div>`).join('')
      : '<div class="off-note">Tidak praktik pada hari ini</div>'
    return `<div class="board-row"><div class="who-doc"><strong>${esc(d.name)}</strong><span>${esc(d.specialty)} · ${esc(d.room)}</span></div>${cells}</div>`
  }).join('')
  const pick = state.pick && state.doctors.find(d => d.id === state.pick.doctorId)
  return `
  <div class="days" role="group" aria-label="Pilih tanggal">${days.map(day => { const p = parts(day); return `<button class="day" data-date="${day}" aria-pressed="${day === state.date}" aria-label="${esc(p.long)}"><span>${esc(p.weekday)}</span><b>${esc(p.day)}</b><span>${esc(p.month)}</span></button>` }).join('')}</div>
  <div class="board-wrap"><div class="board">
    <div class="board-row board-head"><div>Dokter</div>${hours.map(h => `<div>${h}</div>`).join('') || '<div></div>'}</div>
    ${rows}
  </div></div>
  <div class="legend"><span><i></i>Tersedia</span><span><i class="taken"></i>Terisi atau lewat</span><span><i class="picked"></i>Dipilih</span></div>
  ${pick ? `<form class="sheet" id="book-form">
    <div><h2>Konfirmasi reservasi</h2><p class="pick"><b>${esc(pick.name)}</b><br>${esc(parts(state.date).long)}, pukul <b>${state.pick.slot} WIB</b></p><p class="privacy">Keluhan hanya dapat dibaca oleh Anda dan dokter yang dipilih, serta disimpan terenkripsi.</p></div>
    <div><div class="field"><label for="complaint">Keluhan utama (opsional)</label><textarea id="complaint" maxlength="500" placeholder="Contoh: demam sejak tiga hari"></textarea></div><button class="btn" type="submit" ${state.busy ? 'disabled' : ''}>Pesan jadwal ini</button></div>
  </form>` : ''}`
}

function appointmentRow(a, role) {
  const [cls, label] = STATUS[a.status]
  const p = parts(a.date)
  const who = role === 'doctor' ? esc(a.patientName) : esc(a.doctorName)
  const meta = role === 'doctor' ? `${a.slot} WIB · ${esc(a.room)}` : `${esc(a.specialty)} · ${a.slot} WIB · ${esc(a.room)}`
  const actions = []
  if (a.status === 'BOOKED' && role === 'patient') actions.push(`<button class="btn danger small" data-cancel="${a.id}">Batalkan</button>`)
  if (a.status === 'BOOKED' && role === 'doctor') actions.push(`<button class="btn small" data-complete="${a.id}">Selesaikan</button>`)
  return `<li class="row"><div class="stamp"><b>${esc(p.day)}</b><span>${esc(p.month)}</span></div>
    <div class="row-main"><strong>${who}</strong><span class="meta">${meta}</span>
    ${a.complaint ? `<p class="text"><em>Keluhan:</em> ${esc(a.complaint)}</p>` : ''}
    ${a.note ? `<p class="text"><em>Catatan dokter:</em> ${esc(a.note)}</p>` : ''}</div>
    <div class="row-actions"><span class="status ${cls}">${label}</span>${actions.join('')}</div></li>`
}

function mineView() {
  if (!state.appointments.length) return '<div class="empty">Belum ada reservasi. Pilih menu Reservasi baru untuk membuat jadwal pertama Anda.</div>'
  const active = state.appointments.filter(a => a.status === 'BOOKED')
  const past = state.appointments.filter(a => a.status !== 'BOOKED').reverse()
  return `${active.length ? `<h2 class="group-title">Akan datang</h2><ul class="rows">${active.map(a => appointmentRow(a, 'patient')).join('')}</ul>` : ''}
    ${past.length ? `<h2 class="group-title">Riwayat</h2><ul class="rows">${past.map(a => appointmentRow(a, 'patient')).join('')}</ul>` : ''}`
}

function scheduleView() {
  const filters = [['ALL', 'Semua'], ['BOOKED', 'Terjadwal'], ['COMPLETED', 'Selesai'], ['CANCELLED', 'Dibatalkan']]
  const list = state.appointments.filter(a => state.filter === 'ALL' || a.status === state.filter)
  return `<div class="filters">${filters.map(([k, l]) => `<button data-filter="${k}" aria-pressed="${state.filter === k}">${l}</button>`).join('')}</div>
    ${list.length ? `<ul class="rows">${list.map(a => appointmentRow(a, 'doctor')).join('')}</ul>` : '<div class="empty">Tidak ada pasien pada filter ini.</div>'}`
}

function allView() {
  if (!state.appointments.length) return '<div class="empty">Belum ada reservasi.</div>'
  return `<div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Jam</th><th>Pasien</th><th>Dokter</th><th>Status</th><th></th></tr></thead><tbody>${state.appointments.map(a => {
    const [cls, label] = STATUS[a.status]
    const p = parts(a.date)
    return `<tr><td>${esc(p.day)} ${esc(p.month)}</td><td>${a.slot}</td><td>${esc(a.patientName)}</td><td>${esc(a.doctorName)}</td><td><span class="status ${cls}">${label}</span></td><td>${a.status === 'BOOKED' ? `<button class="btn danger small" data-cancel="${a.id}">Batalkan</button>` : ''}</td></tr>`
  }).join('')}</tbody></table></div>`
}

function shellView() {
  const nav = navItems().map(([key, label, icon]) => `<button data-view="${key}" ${state.view === key ? 'aria-current="page"' : ''}>${icon}${label}</button>`).join('')
  let body = '<p class="loading">Memuat data…</p>'
  if (!state.busy || state.view === 'book' && state.doctors.length) {
    body = { book: boardView, mine: mineView, schedule: scheduleView, all: allView }[state.view]()
  }
  return `<div class="shell">
    <aside class="rail"><div class="brand"><span class="brand-mark">${icons.mark}</span>Klinik Sehat Sentosa</div>
      <nav class="nav" aria-label="Menu utama">${nav}</nav>
      <div class="who"><div><strong>${esc(state.session.name)}</strong><span>${ROLE_LABEL[state.session.role]}</span></div><button class="btn ghost small" id="logout">Keluar</button></div>
    </aside>
    <main class="main">${topline()}${body}</main>
  </div>`
}

function render() {
  const focused = document.activeElement?.id
  app.innerHTML = state.session ? (state.view ? shellView() : '') : loginView()
  if (focused) document.getElementById(focused)?.focus()
}

function openDialog(html, onSubmit) {
  dialog.innerHTML = html
  dialog.showModal()
  dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close())
  dialog.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault()
    const button = dialog.querySelector('button[type="submit"]')
    button.disabled = true
    try {
      await onSubmit(new FormData(e.target))
      dialog.close()
    } catch (err) {
      button.disabled = false
      const box = dialog.querySelector('.error') || dialog.querySelector('form').insertAdjacentElement('afterbegin', Object.assign(document.createElement('div'), { className: 'error' }))
      box.textContent = err.message
    }
  })
}

async function submitAuth(form) {
  const data = Object.fromEntries(new FormData(form))
  const errorBox = document.getElementById('form-error')
  const button = document.getElementById('submit-btn')
  const fail = message => { errorBox.innerHTML = `<div class="error" role="alert">${esc(message)}</div>`; button.disabled = false }
  button.disabled = true
  errorBox.innerHTML = ''
  try {
    if (state.mode === 'register') {
      const reg = await fetch('/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
      if (!reg.ok) return fail((await reg.json()).message)
    }
    const res = await fetch('/auth/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grant_type: 'password', client_id: 'web', username: data.email, password: data.password })
    })
    const body = await res.json()
    if (!res.ok) return fail(body.error_description || body.message || 'Gagal masuk')
    saveSession(body)
    state.mode = 'login'
    startPolling()
    await enter(defaultView())
  } catch {
    fail('Server tidak dapat dihubungi, coba lagi')
  }
}

async function bookNow() {
  const complaint = document.getElementById('complaint').value.trim()
  state.busy = true
  render()
  try {
    await gql('mutation($i: BookingInput!) { bookAppointment(input: $i) { id } }', { i: { doctorId: state.pick.doctorId, date: state.date, slot: state.pick.slot, complaint: complaint || null } })
    toast('Reservasi berhasil dibuat. Konfirmasi dikirim ke notifikasi Anda.')
    state.pick = null
    state.busy = false
    await enter('mine')
  } catch (err) {
    toast(err.message, true)
    state.busy = false
    state.pick = null
    try { await loadBoard() } catch {}
    render()
  }
}

function confirmCancel(id) {
  const a = state.appointments.find(x => x.id === id)
  openDialog(`<form method="dialog"><h2>Batalkan reservasi?</h2><p class="sub">${esc(a.doctorName)}, ${esc(parts(a.date).long)} pukul ${a.slot} WIB. Jam ini akan terbuka kembali untuk pasien lain.</p>
    <div class="dialog-actions"><button class="btn ghost" type="button" data-close>Kembali</button><button class="btn danger" type="submit">Ya, batalkan</button></div></form>`,
  async () => {
    await gql('mutation($id: ID!) { cancelAppointment(id: $id) { id } }', { id })
    toast('Reservasi dibatalkan')
    await enter(state.view)
  })
}

function openComplete(id) {
  const a = state.appointments.find(x => x.id === id)
  openDialog(`<form method="dialog"><h2>Selesaikan pemeriksaan</h2><p class="sub">${esc(a.patientName)}, ${esc(parts(a.date).long)} pukul ${a.slot} WIB</p>
    ${a.complaint ? `<p class="sub"><b>Keluhan:</b> ${esc(a.complaint)}</p>` : ''}
    <div class="field"><label for="note">Catatan medis</label><textarea id="note" name="note" required minlength="3" maxlength="1000"></textarea><small>Disimpan terenkripsi dan dapat dibaca pasien pada riwayat reservasinya.</small></div>
    <div class="dialog-actions"><button class="btn ghost" type="button" data-close>Batal</button><button class="btn" type="submit">Simpan dan selesaikan</button></div></form>`,
  async data => {
    await gql('mutation($id: ID!, $note: String!) { completeAppointment(id: $id, note: $note) { id } }', { id, note: data.get('note') })
    toast('Pemeriksaan ditandai selesai')
    await enter(state.view)
  })
}

app.addEventListener('submit', e => {
  if (e.target.id === 'auth-form') { e.preventDefault(); submitAuth(e.target) }
  if (e.target.id === 'book-form') { e.preventDefault(); bookNow() }
})

app.addEventListener('click', async e => {
  const t = e.target.closest('button')
  if (!t) {
    if (state.inbox && !e.target.closest('.bell')) { state.inbox = false; render() }
    return
  }
  if (t.id === 'toggle-mode') { state.mode = state.mode === 'login' ? 'register' : 'login'; render() }
  else if (t.dataset.demo) {
    state.mode = 'login'
    render()
    document.getElementById('email').value = t.dataset.demo
    document.getElementById('password').value = 'Klinik#2026'
  }
  else if (t.id === 'logout') {
    const refresh = state.session.refresh
    fetch('/auth/oauth/revoke', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: refresh }) }).catch(() => {})
    clearSession()
    render()
  }
  else if (t.dataset.view) enter(t.dataset.view)
  else if (t.dataset.date) {
    state.date = t.dataset.date
    state.pick = null
    state.busy = true
    render()
    try { await loadBoard() } catch (err) { toast(err.message, true) }
    state.busy = false
    render()
  }
  else if (t.dataset.slot) { state.pick = { doctorId: t.dataset.doctor, slot: t.dataset.slot }; render(); document.getElementById('book-form')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }
  else if (t.dataset.cancel) confirmCancel(t.dataset.cancel)
  else if (t.dataset.complete) openComplete(t.dataset.complete)
  else if (t.dataset.filter) { state.filter = t.dataset.filter; render() }
  else if (t.id === 'bell') {
    state.inbox = !state.inbox
    render()
    if (state.inbox && state.notifications.unread) {
      const unread = state.notifications.items.filter(n => !n.read)
      await Promise.all(unread.map(n => authed(`/notifications/${n.id}/read`, { method: 'PATCH' }).catch(() => {})))
      setTimeout(async () => { await loadNotifications().catch(() => {}); if (state.inbox) render() }, 1200)
    }
  }
})

if (state.session) {
  startPolling()
  enter(defaultView())
} else {
  render()
}
