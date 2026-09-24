import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { FormEvent, useMemo, useRef, useState } from 'react'
import { logout } from '@netlify/identity'
import { addCustomer, addExpense, addLoan, addPayment, getWorkspace, removeCashBook, removeCustomer, removeExpense, removeLoan, removePayment, removeTarget, runStatusClosing, saveCashBook, saveTarget, setLoanClassification, updateCustomerProfile, updateLegacyBalance, updatePayment } from '../server/kolekta.functions'
import { getSessionUser } from '../server/auth.functions'
import { LayoutDashboard, Users, HandCoins, WalletCards, Target, Search, Plus, ArrowUpRight, CalendarDays, X, CheckCircle2, AlertTriangle, Menu, ChevronRight, Check, Loader2, LogOut, Banknote, Receipt, PiggyBank, ArrowDownRight, Trash2, Wallet, FileDown, TrendingUp, TrendingDown, LineChart, Pencil, IdCard, ShieldAlert, History, RefreshCw } from 'lucide-react'
import { decimal, formatMoneyInput, formatNik, hasDecimal, parseMoneyInput, rupiah, shortDate, toWholeRupiah } from '../lib/format'
import { DROP_CASH_RATE, buildCashSummary, cashDates, cashPosition } from '../lib/cash'
import { downloadPdf } from '../lib/pdf'
import { angsuranPdf, tunaiPdf } from '../lib/reports'
import { buildProfitPeriods, expenseByCategory, periodLabel, periodOf, potentialJasa, profitTone, sumProfit } from '../lib/profit'
import { isDropLoan, isLegacyLoan, isLegacyMember, legacyLoanOf, legacyProgress, legacySummary } from '../lib/legacy'
import { CLASSIFICATIONS, CLASSIFICATION_HINT, CLASSIFICATION_NAME, CLASSIFICATION_TONE, RECOVERED_LABEL, classificationBadge, classificationTally, monthlyInstallment, periodArrears, worstClassification } from '../lib/classification'
import { IncomeExpenseChart, NetProfitChart } from '../components/charts/ProfitCharts'
import { MsbMark } from '../components/brand/MsbMark'

export const Route = createFileRoute('/')({
 loader: async () => {
  const session = await getSessionUser()
  if (!session) throw redirect({ to: '/login' })
  return { ...(await getWorkspace()), session }
 },
 component: Home,
})
type View = 'ringkasan' | 'nasabah' | 'pinjaman' | 'angsuran' | 'tunai' | 'pengeluaran' | 'perkembangan' | 'target'
// Setiap permintaan hapus lewat dialog konfirmasi yang sama: key dipakai untuk
// menandai baris yang sedang diproses, run memanggil server function-nya.
type Ask = { key: string; title: string; text: string; run: () => Promise<unknown>; success: string }
const nav = [{id:'ringkasan' as View,label:'Ringkasan',icon:LayoutDashboard,tone:'teal'},{id:'nasabah' as View,label:'Data Nasabah',icon:Users,tone:'sky'},{id:'pinjaman' as View,label:'Transaksi',icon:HandCoins,tone:'amber'},{id:'angsuran' as View,label:'Angsuran',icon:WalletCards,tone:'emerald'},{id:'tunai' as View,label:'Tunai',icon:Banknote,tone:'violet'},{id:'pengeluaran' as View,label:'Pengeluaran',icon:Receipt,tone:'rose'},{id:'perkembangan' as View,label:'Perkembangan',icon:LineChart,tone:'sky'},{id:'target' as View,label:'Target & Storting',icon:Target,tone:'teal'}]
const DROP_PCT = Math.round(DROP_CASH_RATE * 100)
const EXPENSE_KINDS = ['Bensin','Makan & minum','Servis kendaraan','Pulsa & data','Gaji kolektor','Operasional kantor','Lain-lain']
const BUSINESS_KINDS = ['Warung / toko kelontong','Pedagang pasar','Pedagang keliling','Warung makan','Jasa & bengkel','Pertanian','Peternakan','Konveksi & jahit','Lain-lain']
// Tanggal kerja memakai zona Indonesia, bukan UTC: kalau tidak, kas dan angsuran
// yang dicatat sebelum jam 07.00 WIB akan jatuh ke tanggal kemarin.
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
// Periode berjalan dipakai menilai tunggakan bulan ini di menu Angsuran.
const runningPeriod=periodOf(today)
// Pilihan filter klasifikasi. 'lunas' bukan klasifikasi tersendiri melainkan
// tagihan CM/Macet yang tunggakannya sudah diselesaikan.
const KLAS_FILTERS=[{value:'semua',label:'Semua klasifikasi'},...CLASSIFICATIONS.map(c=>({value:c as string,label:`${c} — ${CLASSIFICATION_NAME[c]}`})),{value:'lunas',label:RECOVERED_LABEL}]
const klasFilterLabel=(value:string)=>KLAS_FILTERS.find(f=>f.value===value)?.label??'Semua klasifikasi'

function Home(){
 const data=Route.useLoaderData(),router=useRouter()
 const [view,setView]=useState<View>('ringkasan'),[modal,setModal]=useState<'nasabah'|'pinjaman'|'bayar'|'target'|'pengeluaran'|'profil'|'angsuran'|null>(null),[editing,setEditing]=useState<any>(null),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[mobile,setMobile]=useState(false),[payDraft,setPayDraft]=useState<Record<number,string>>({}),[payingId,setPayingId]=useState<number|null>(null),[cashDate,setCashDate]=useState(today),[expenseFilter,setExpenseFilter]=useState(''),[deleting,setDeleting]=useState<string|null>(null),[ask,setAsk]=useState<Ask|null>(null),[profitRange,setProfitRange]=useState('12'),[legacyOnly,setLegacyOnly]=useState(false),[savingLegacy,setSavingLegacy]=useState<number|null>(null),[klasFilter,setKlasFilter]=useState('semua'),[klasSaving,setKlasSaving]=useState<number|null>(null),[closing,setClosing]=useState(false)
 // Sisa tagihan, tunggakan periode berjalan, dan badge klasifikasi dihitung dari
 // catatan angsuran yang sama dengan yang dipakai penjadwal tutup bulan, jadi
 // yang tampil di layar tidak pernah berbeda dengan yang dieksekusi di server.
 const loanData=useMemo(()=>data.loans.map(loan=>{const rows=data.payments.filter(p=>p.loanId===loan.id),paid=rows.reduce((n,p)=>n+p.amount,0),balance=Math.max(0,loan.totalDue-paid),overdue=balance>0&&new Date(loan.dueDate)<new Date(today),paidInPeriod=rows.filter(p=>periodOf(p.paymentDate)===runningPeriod).reduce((n,p)=>n+p.amount,0),base={...loan,paid,balance,status:balance===0?'Lunas':overdue?'Macet':'Berjalan'};return{...base,paidInPeriod,perBulan:monthlyInstallment(base),arrears:periodArrears(base,paidInPeriod,today),klas:classificationBadge(base)}}),[data])
 // Daftar Angsuran mengikuti filter klasifikasi: 'lunas' menyaring tagihan
 // CM/Macet yang tunggakannya sudah diselesaikan, bukan klasifikasi tersendiri.
 const angsuranRows=useMemo(()=>loanData.filter(l=>klasFilter==='semua'||(klasFilter==='lunas'?l.klas.settled:l.klas.code===klasFilter)),[loanData,klasFilter])
 const klasTally=useMemo(()=>classificationTally(loanData),[loanData])
 // Transaksi pinjaman lama ikut ke tagihan berjalan karena itu piutang nyata, tapi
 // tidak ke total drop: uangnya sudah keluar sebelum aplikasi ini dipakai.
 const legacyLoans=useMemo(()=>loanData.filter(isLegacyLoan),[loanData])
 // Storting menghitung seluruh angsuran yang masuk, termasuk angsuran saldo
 // nasabah lama: uangnya benar-benar diterima kolektor. Yang tetap di luar hanya
 // jumlah pinjaman lamanya, sebab uang itu keluar sebelum aplikasi ini dipakai.
 const totalDrop=data.loans.filter(isDropLoan).reduce((n,l)=>n+l.principal,0),totalPaid=data.payments.reduce((n,p)=>n+p.amount,0),outstanding=loanData.reduce((n,l)=>n+l.balance,0),currentTarget=data.targets[0]
 const dailyPaid=currentTarget?data.payments.filter(p=>p.paymentDate===currentTarget.reportDate).reduce((n,p)=>n+p.amount,0):0
 const targetPct=currentTarget?.collectionTarget?Math.min(100,Math.round(dailyPaid/currentTarget.collectionTarget*100)):0
 const cashRecord=data.cashBooks.find(c=>c.reportDate===cashDate)
 const cashSummary=useMemo(()=>buildCashSummary(cashDate,data.payments,data.loans,data.expenses,cashRecord),[cashDate,cashRecord,data])
 const cashHistory=useMemo(()=>cashDates(data.payments,data.loans,data.expenses,data.cashBooks.map(c=>c.reportDate)).slice(0,12).map(d=>buildCashSummary(d,data.payments,data.loans,data.expenses,data.cashBooks.find(c=>c.reportDate===d))),[data])
 const expenseRows=data.expenses.filter(e=>!expenseFilter||e.expenseDate===expenseFilter)
 const expenseToday=data.expenses.filter(e=>e.expenseDate===today).reduce((n,e)=>n+e.amount,0)
 const expenseShown=expenseRows.reduce((n,e)=>n+e.amount,0)
 // Laba rugi diturunkan dari catatan yang sama dengan dasbor: porsi jasa tiap
 // angsuran menjadi pendapatan, pengeluaran menjadi beban.
 const profitPeriods=useMemo(()=>buildProfitPeriods(data.loans,data.payments,data.expenses),[data])
 const potensiJasa=useMemo(()=>potentialJasa(data.loans,data.payments),[data])
 const profitRows=useMemo(()=>profitRange==='all'?profitPeriods:profitPeriods.slice(0,Number(profitRange)),[profitPeriods,profitRange])
 const profitTotals=useMemo(()=>sumProfit(profitRows,potensiJasa),[profitRows,potensiJasa])
 const profitScope=useMemo(()=>new Set(profitRows.map(r=>r.period)),[profitRows])
 const profitBreakdown=useMemo(()=>expenseByCategory(data.expenses.filter(e=>profitScope.has(periodOf(e.expenseDate)))),[data,profitScope])
 // Sisa pinjaman lama dibaca dari transaksinya, bukan dari kolom di master nasabah,
 // jadi setiap angsuran yang masuk langsung mengurangi angka yang tampil di sini.
 const legacyStats=useMemo(()=>legacySummary(data.customers,legacyLoans),[data,legacyLoans])
 const incompleteProfiles=data.customers.filter(c=>!c.nik||!c.businessType).length
 const customerRows=useMemo(()=>data.customers.map(c=>({...c,legacy:legacyLoanOf(c,legacyLoans),isLegacy:isLegacyMember(c,legacyLoans)})),[data,legacyLoans])
 const filteredCustomers=customerRows.filter(c=>(!legacyOnly||c.isLegacy)&&`${c.name} ${c.memberNumber} ${c.collector} ${c.nik} ${c.businessType} ${c.businessAddress}`.toLowerCase().includes(search.toLowerCase()))
 // Riwayat angsuran dipakai menu Angsuran supaya setiap setoran bisa dikoreksi
 // atau dihapus satu per satu. `maxAmount` adalah nominal terbesar yang masih
 // boleh dicatat pada baris itu — total tagihan dikurangi setoran lainnya — jadi
 // form koreksi bisa menyebut batasnya sebelum server menolaknya.
 const paymentLog=useMemo(()=>data.payments.map(p=>{const loan=loanData.find(l=>l.id===p.loanId);return{...p,customerName:loan?.customerName??'Nasabah terhapus',memberNumber:loan?.memberNumber??'—',kind:loan?.kind??null,maxAmount:loan?Math.max(0,loan.totalDue-(loan.paid-p.amount)):p.amount}}),[loanData])
 // `success` boleh berupa fungsi supaya pesan bisa menyebut hasil dari server.
 async function submit(action:()=>Promise<unknown>,success:string|((result:any)=>string)){setBusy(true);setMessage('');try{const result=await action();await router.invalidate();setModal(null);setMessage(typeof success==='function'?success(result):success);setTimeout(()=>setMessage(''),4500);return true}catch(e){setMessage(e instanceof Error?e.message:'Data belum dapat disimpan.');return false}finally{setBusy(false)}}
 function exportPdf(){
  try{
   downloadPdf(view==='tunai'?tunaiPdf(cashDate,cashSummary,cashHistory):angsuranPdf(angsuranRows,today,klasFilterLabel(klasFilter)))
   setMessage(view==='tunai'?`Laporan tunai ${shortDate(cashDate)} diunduh sebagai PDF.`:'Laporan angsuran diunduh sebagai PDF.')
   setTimeout(()=>setMessage(''),3500)
  }catch{setMessage('Laporan PDF belum dapat dibuat, coba lagi.')}
 }
 async function quickPay(loan:any){
  const amount=toWholeRupiah(payDraft[loan.id]||'')
  if(amount<=0){setMessage('Nominal pembayaran wajib diisi.');return}
  if(amount>loan.balance){setMessage(`Pembayaran melebihi sisa tagihan ${rupiah(loan.balance)}.`);return}
  setPayingId(loan.id)
  const ok=await submit(()=>addPayment({data:{loanId:loan.id,amount,paymentDate:today,note:'Setoran lapangan'}}),`${rupiah(amount)} dari ${loan.customerName} tercatat. Klasifikasi ${loan.klas.code} tidak berubah karena ada setoran.`)
  setPayingId(null)
  if(ok)setPayDraft(d=>({...d,[loan.id]:''}))
 }
 async function saveKlas(loan:any,code:string){
  // Penyesuaian manual pengelola. Statusnya dihormati sebagai titik awal jenjang
  // berikutnya, jadi tutup bulan tetap berjalan dari angka yang dipilih di sini.
  setKlasSaving(loan.id)
  await submit(()=>setLoanClassification({data:{loanId:loan.id,classification:code,reason:`Penyesuaian manual dari menu Angsuran untuk ${loan.customerName}.`}}),`Klasifikasi ${loan.customerName} disesuaikan menjadi ${CLASSIFICATION_NAME[code as keyof typeof CLASSIFICATION_NAME]}.`)
  setKlasSaving(null)
 }
 async function runKlasClosing(){
  // Tombol ini menjalankan transisi yang sama dengan penjadwal tanggal 30. Aman
  // ditekan berulang: periode yang sudah ditutup tidak diproses dua kali.
  setClosing(true)
  await submit(()=>runStatusClosing(),(res:any)=>`Transisi periode ${res?.period??runningPeriod} dijalankan: ${res?.processed??0} tagihan diperiksa, ${res?.skipped??0} sudah ditutup sebelumnya, ${res?.moves?.length??0} berpindah status.`)
  setClosing(false)
 }
 async function saveLegacy(customer:any,principal:number,balance:number){
  // Ini koreksi angka pinjaman lamanya, bukan pencatatan setoran. Setoran nasabah
  // lewat menu Angsuran, dan angsuran itu tetap di luar storting, tunai, dan perkembangan.
  setSavingLegacy(customer.id)
  await submit(()=>updateLegacyBalance({data:{id:customer.id,principal,balance}}),`Pinjaman lama ${customer.name}: jumlah ${rupiah(principal)}, saldo ${rupiah(balance)}.`)
  setSavingLegacy(null)
 }
 async function saveCash(kasbon:number,titipan:number){
  return submit(()=>saveCashBook({data:{reportDate:cashDate,kasbon,titipan,notes:cashRecord?.notes??''}}),`Kasbon dan titipan ${shortDate(cashDate)} tersimpan.`)
 }
 async function runAsk(){
  if(!ask)return
  const job=ask
  setDeleting(job.key)
  // Dialog tetap terbuka selama proses agar tombolnya jelas sedang bekerja, lalu
  // ditutup apa pun hasilnya supaya pesan berhasil atau gagal terlihat.
  await submit(job.run,job.success)
  setDeleting(null)
  setAsk(null)
 }
 const askCustomer=(c:any)=>setAsk({key:`nasabah-${c.id}`,title:'Hapus nasabah',text:`${c.name} (${c.memberNumber}) akan dihapus dari master data${c.legacy?.balance>0?`, termasuk transaksi pinjaman lamanya yang sisa ${rupiah(c.legacy.balance)}`:''}. Nasabah yang masih punya transaksi pinjaman atau angsuran tercatat tidak bisa dihapus.`,run:()=>removeCustomer({data:{id:c.id}}),success:`Nasabah ${c.name} dihapus.`})
 const editProfile=(c:any)=>{setEditing(c);setModal('profil')}
 const askLoan=(l:any)=>setAsk({key:`pinjaman-${l.id}`,title:isLegacyLoan(l)?'Hapus transaksi pinjaman lama':'Hapus transaksi pinjaman',text:`${isLegacyLoan(l)?`Tagihan pinjaman lama ${rupiah(l.totalDue)}`:`Drop ${rupiah(l.principal)}`} untuk ${l.customerName} tanggal ${shortDate(l.dropDate)} akan dihapus${l.paid>0?`, termasuk ${rupiah(l.paid)} angsuran yang sudah tercatat`:''}. Rekap tunai dan laba rugi ikut dihitung ulang.`,run:()=>removeLoan({data:{id:l.id}}),success:`Transaksi ${l.customerName} dihapus.`})
 const editPayment=(p:any)=>{setEditing(p);setModal('angsuran')}
 const askPayment=(p:any)=>setAsk({key:`angsuran-${p.id}`,title:'Hapus angsuran',text:`Setoran ${rupiah(p.amount)} dari ${p.customerName} tanggal ${shortDate(p.paymentDate)} akan dihapus dan sisa tagihannya kembali naik.`,run:()=>removePayment({data:{id:p.id}}),success:'Angsuran dihapus dan sisa tagihan diperbarui.'})
 const askExpense=(e:any)=>setAsk({key:`pengeluaran-${e.id}`,title:'Hapus pengeluaran',text:`Pengeluaran ${e.category} sebesar ${rupiah(e.amount)} tanggal ${shortDate(e.expenseDate)} akan dihapus dari rekap tunai dan beban operasional.`,run:()=>removeExpense({data:{id:e.id}}),success:'Pengeluaran dihapus dan rekap tunai diperbarui.'})
 const askTarget=(t:any)=>setAsk({key:`target-${t.id}`,title:'Hapus target harian',text:`Target storting ${rupiah(t.collectionTarget)} tanggal ${shortDate(t.reportDate)} akan dihapus. Angsuran yang sudah masuk tidak terpengaruh.`,run:()=>removeTarget({data:{id:t.id}}),success:'Target harian dihapus.'})
 const askCash=(c:any)=>setAsk({key:`tunai-${c.id}`,title:'Hapus kasbon & titipan',text:`Kasbon ${rupiah(c.kasbon)} dan titipan ${rupiah(c.titipan)} tanggal ${shortDate(c.reportDate)} akan dihapus. Storting, drop, dan pengeluaran tanggal itu tetap tersimpan.`,run:()=>removeCashBook({data:{id:c.id}}),success:`Kasbon dan titipan ${shortDate(c.reportDate)} dihapus.`})
 const openForView=()=>setModal(view==='nasabah'?'nasabah':view==='pinjaman'?'pinjaman':view==='angsuran'?'bayar':view==='target'?'target':view==='pengeluaran'?'pengeluaran':'nasabah')
 return <div className="app-shell" data-view={view}><aside className={mobile?'sidebar open':'sidebar'}><div className="brand"><MsbMark size={42}/><div><strong>MSB</strong><span>Koperasi Lapangan</span></div></div><nav>{nav.map(item=><button key={item.id} data-tone={item.tone} className={view===item.id?'nav-active':''} onClick={()=>{setView(item.id);setMobile(false)}}><item.icon size={19}/><span>{item.label}</span>{view===item.id&&<ChevronRight className="nav-arrow" size={16}/>}</button>)}</nav><div className="sidebar-note"><span>PERIODE AKTIF</span><strong>September 2026</strong><small>Data tersimpan aman di Netlify</small></div></aside>{mobile&&<button className="scrim" aria-label="Tutup menu" onClick={()=>setMobile(false)}/>}<main><header><button className="mobile-menu" onClick={()=>setMobile(true)}><Menu/></button><div><p>OPERASIONAL KOLEKTOR</p><h1>{nav.find(n=>n.id===view)?.label}</h1></div><div className="header-actions"><span className="date-pill"><CalendarDays size={16}/>{shortDate(today)}</span><span className="user-chip" title={data.session.email}><b>{(data.session.name||data.session.email||'?').charAt(0).toUpperCase()}</b><small>{data.session.name||data.session.email}</small></span>{(view==='angsuran'||view==='tunai')&&<button className="secondary export-pdf" title="Unduh laporan dalam bentuk PDF" onClick={exportPdf}><FileDown size={16}/><span>Export PDF</span></button>}{view!=='angsuran'&&view!=='tunai'&&view!=='perkembangan'&&<button className="primary" onClick={openForView}><Plus size={17}/>{view==='ringkasan'?'Nasabah baru':view==='target'?'Atur target':view==='pinjaman'?'Transaksi baru':view==='pengeluaran'?'Pengeluaran baru':'Nasabah baru'}</button>}<button className="secondary logout" title="Keluar dari akun" onClick={async()=>{await logout();window.location.href='/login'}}><LogOut size={16}/><span>Keluar</span></button></div></header>{message&&(()=>{const bad=message.includes('belum')||message.includes('wajib')||message.includes('melebihi')||message.includes('masih')||message.includes('tidak ditemukan');return <div className={bad?'toast error':'toast'} role="status">{bad?<AlertTriangle size={18}/>:<CheckCircle2 size={18}/>}{message}</div>})()}<section className="content">
 {view==='ringkasan'&&<Dashboard customers={data.customers.length} totalDrop={totalDrop} totalPaid={totalPaid} outstanding={outstanding} loans={loanData} targetPct={targetPct} onDelete={askLoan} deleting={deleting}/>} 
 {view==='nasabah'&&<CustomerView rows={filteredCustomers} summary={legacyStats} incomplete={incompleteProfiles} legacyOnly={legacyOnly} setLegacyOnly={setLegacyOnly} search={search} setSearch={setSearch} loans={loanData} onDelete={askCustomer} onEdit={editProfile} deleting={deleting} onSaveLegacy={saveLegacy} savingLegacy={savingLegacy}/>}
 {view==='pinjaman'&&<TransactionView rows={loanData} legacyCount={legacyLoans.length} onDelete={askLoan} deleting={deleting}/>}
 {view==='angsuran'&&<AngsuranView rows={angsuranRows} total={loanData.length} tally={klasTally} filter={klasFilter} setFilter={setKlasFilter} payDraft={payDraft} setPayDraft={setPayDraft} payingId={payingId} onPay={quickPay} onKlas={saveKlas} klasSaving={klasSaving} closing={closing} onClosing={runKlasClosing} onForm={()=>setModal('bayar')} log={paymentLog} onEditPayment={editPayment} onDeletePayment={askPayment} deleting={deleting} statusLogs={data.statusLogs}/>}
 {view==='tunai'&&<CashView key={`${cashDate}-${cashRecord?.id??0}-${cashRecord?.kasbon??0}-${cashRecord?.titipan??0}`} date={cashDate} setDate={setCashDate} summary={cashSummary} record={cashRecord} history={cashHistory} records={data.cashBooks} onSave={saveCash} onDelete={askCash} deleting={deleting} busy={busy}/>}
 {view==='pengeluaran'&&<ExpenseView rows={expenseRows} todayTotal={expenseToday} shownTotal={expenseShown} filter={expenseFilter} setFilter={setExpenseFilter} onAdd={()=>setModal('pengeluaran')} onDelete={askExpense} deleting={deleting}/>}
 {view==='perkembangan'&&<ProgressView rows={profitRows} totals={profitTotals} breakdown={profitBreakdown} range={profitRange} setRange={setProfitRange} loans={loanData.length}/>}
 {view==='target'&&<><SectionHead eyebrow="STORTING HARIAN" title="Target & realisasi" text="Menggabungkan sheet Storting dan Target menjadi laporan yang langsung terbaca. Realisasi menghitung seluruh angsuran yang masuk, termasuk angsuran saldo nasabah lama."/><div className="target-layout"><article className="target-main"><div><span>REALISASI STORTING</span><strong>{targetPct}%</strong><small>{rupiah(dailyPaid)} dari {rupiah(currentTarget?.collectionTarget||0)}</small></div><div className="target-ring" style={{'--pct':`${targetPct*3.6}deg`} as React.CSSProperties}><b>{targetPct}%</b></div></article><article className="target-detail"><h3>Target aktif</h3><dl><div><dt>Tanggal</dt><dd>{currentTarget?shortDate(currentTarget.reportDate):'Belum diatur'}</dd></div><div><dt>Resort</dt><dd>{currentTarget?.resort||'—'}</dd></div><div><dt>Target storting</dt><dd>{rupiah(currentTarget?.collectionTarget||0)}</dd></div><div><dt>Target drop</dt><dd>{rupiah(currentTarget?.dropTarget||0)}</dd></div></dl></article></div><div className="table-card"><table><thead><tr><th>Tanggal</th><th>Resort</th><th>Target Storting</th><th>Rencana Drop</th><th>Realisasi</th><th>Catatan</th><th aria-label="Aksi"/></tr></thead><tbody>{data.targets.map(t=>{const masuk=data.payments.filter(p=>p.paymentDate===t.reportDate).reduce((n,p)=>n+p.amount,0);return <tr key={t.id}><td><b>{shortDate(t.reportDate)}</b></td><td>{t.resort||'—'}</td><td>{rupiah(t.collectionTarget)}</td><td>{rupiah(t.dropTarget)}</td><td><b>{rupiah(masuk)}</b><small>{t.collectionTarget?`${Math.min(100,Math.round(masuk/t.collectionTarget*100))}% target`:'target belum diisi'}</small></td><td>{t.notes||'—'}</td><td className="row-act"><DeleteButton busy={deleting===`target-${t.id}`} onClick={()=>askTarget(t)} label={`Hapus target ${shortDate(t.reportDate)}`}/></td></tr>})}</tbody></table><Empty show={!data.targets.length} text="Belum ada target harian tersimpan."/></div></>}
 </section></main>{modal&&<Modal type={modal} close={()=>{setModal(null);setEditing(null)}} busy={busy} submit={submit} customers={data.customers} loans={loanData} customer={editing} payment={editing}/>}{ask&&<ConfirmDelete ask={ask} busy={busy} close={()=>setAsk(null)} confirm={runAsk}/>}</div>
}

/** Tombol hapus baris: ikon tong sampah, berubah menjadi pemuat saat diproses. */
function DeleteButton({onClick,busy,label}:{onClick:()=>void,busy:boolean,label:string}){
 return <button type="button" className="row-delete" onClick={onClick} disabled={busy} aria-label={label} title={label}>{busy?<Loader2 size={14} className="spin"/>:<Trash2 size={14}/>}</button>
}

/** Tombol aksi baris selain hapus — memakai bentuk yang sama supaya tabel tetap rapi. */
function IconButton({icon:Icon,onClick,label}:{icon:any,onClick:()=>void,label:string}){
 return <button type="button" className="row-delete row-edit" onClick={onClick} aria-label={label} title={label}><Icon size={14}/></button>
}

/** Dialog konfirmasi tunggal untuk semua hapus, supaya data tidak hilang karena salah klik. */
function ConfirmDelete({ask,busy,close,confirm}:{ask:Ask,busy:boolean,close:()=>void,confirm:()=>void}){
 return <div className="modal-layer" role="dialog" aria-modal="true" aria-label={ask.title}>
  <div className="modal confirm">
   <div className="modal-head"><div><span>KONFIRMASI HAPUS</span><h2>{ask.title}</h2></div><button onClick={close} aria-label="Tutup"><X/></button></div>
   <div className="confirm-body">
    <div className="confirm-icon"><AlertTriangle size={22}/></div>
    <div><p>{ask.text}</p><small>Data yang sudah dihapus tidak dapat dikembalikan.</small></div>
   </div>
   <div className="modal-actions confirm-actions"><button type="button" className="secondary" onClick={close}>Batal</button><button type="button" className="danger" disabled={busy} onClick={confirm}>{busy?<><Loader2 size={15} className="spin"/>Menghapus...</>:<><Trash2 size={15}/>Ya, hapus</>}</button></div>
  </div>
 </div>
}

/* ===== Menu Transaksi: drop pinjaman baru dan saldo bawaan nasabah lama =====
   Keduanya tercatat di tabel yang sama supaya sisa tagihannya dihitung dengan
   cara yang sama dan bisa diangsur lewat menu Angsuran. Bedanya hanya pada sisi
   kas: drop mengeluarkan uang hari itu, pinjaman lama tidak. */
function TransactionView({rows,legacyCount,onDelete,deleting}:any){
 const dropTotal=rows.filter(isDropLoan).reduce((n:number,l:any)=>n+l.principal,0)
 const billed=rows.reduce((n:number,l:any)=>n+l.totalDue,0)
 const paid=rows.reduce((n:number,l:any)=>n+l.paid,0)
 const balance=rows.reduce((n:number,l:any)=>n+l.balance,0)
 return <>
  <SectionHead eyebrow="TRANSAKSI" title="Drop pinjaman & pinjaman lama" text={`Drop pinjaman baru otomatis ditagih 120% dari pokok, dan angsurannya masuk ke Storting, Tunai, serta Perkembangan. Saldo nasabah lama ikut tercatat di sini sebagai transaksi resmi: tagihannya nyata, bisa diangsur, dan angsurannya juga masuk ke Storting, Tunai, serta Perkembangan. Yang berbeda hanya jumlah pinjaman lamanya — uangnya keluar sebelum aplikasi ini dipakai, jadi tidak pernah dihitung sebagai drop kas maupun modal yang disalurkan periode ini. Kolom klasifikasi memakai status yang sama dengan menu Angsuran: status awal ditentukan tanggal dropan, lalu berjalan sendiri pada tutup bulan.${legacyCount?` Ada ${legacyCount} transaksi pinjaman lama.`:''}`}/>
  <div className="table-card">
   <table><thead><tr><th>Tanggal</th><th>Nasabah</th><th>Jenis</th><th>Pokok Keluar</th><th>Total Tagihan</th><th>Terbayar</th><th>Sisa</th><th>Jatuh Tempo</th><th>Klasifikasi</th><th>Status</th><th aria-label="Aksi"/></tr></thead>
   <tbody>{rows.map((l:any)=>{const lama=isLegacyLoan(l);return <tr key={l.id}>
    <td>{shortDate(l.dropDate)}</td>
    <td><b>{l.customerName}</b><small>{l.memberNumber}</small></td>
    <td>{lama?<span className="chip lama">Pinjaman lama</span>:<span className="chip drop">Drop 120%</span>}</td>
    <td>{lama?<em className="row-none" title="Pinjaman lama, tidak ada uang keluar dari kas">—</em>:rupiah(l.principal)}</td>
    <td><b>{rupiah(l.totalDue)}</b>{lama&&l.principal!==l.totalDue&&<small>dari pinjaman {rupiah(l.principal)}</small>}</td>
    <td>{rupiah(l.paid)}</td>
    <td><b>{rupiah(l.balance)}</b></td>
    <td>{shortDate(l.dueDate)}</td>
    <td><KlasBadge badge={l.klas}/></td>
    <td><Badge text={l.status}/></td>
    <td className="row-act"><DeleteButton busy={deleting===`pinjaman-${l.id}`} onClick={()=>onDelete(l)} label={`Hapus transaksi ${l.customerName}`}/></td>
   </tr>})}</tbody>
   {rows.length>0&&<tfoot><tr><th colSpan={3}>Total {rows.length} transaksi</th><th>{rupiah(dropTotal)}</th><th>{rupiah(billed)}</th><th>{rupiah(paid)}</th><th>{rupiah(balance)}</th><th colSpan={4}/></tr></tfoot>}
   </table>
   <Empty show={!rows.length} text="Belum ada transaksi pinjaman."/>
  </div>
 </>
}

/**
 * Riwayat setoran di menu Angsuran: satu baris per pembayaran, bisa dikoreksi
 * atau dihapus. Tombol pensil dipakai bila nominal angsuran salah tulis —
 * koreksinya langsung membetulkan sisa tagihan nasabah tanpa perlu menghapus
 * setorannya lebih dulu.
 */
function PaymentLog({rows,onEdit,onDelete,deleting}:any){
 const total=rows.reduce((n:number,p:any)=>n+p.amount,0)
 const lama=rows.filter((p:any)=>isLegacyLoan(p)).reduce((n:number,p:any)=>n+p.amount,0)
 return <div className="table-card payment-log">
  <div className="card-head"><div><small>RIWAYAT ANGSURAN</small><h3>Setoran tercatat</h3></div><span>{rows.length} setoran · {rupiah(total)}</span></div>
  <p className="table-note">Nominal salah tulis dibetulkan lewat tombol pensil — sisa tagihan nasabah ikut terkoreksi begitu perubahannya tersimpan.{lama?` ${rupiah(lama)} di antaranya angsuran saldo nasabah lama, dan nominal itu ikut dihitung sebagai storting.`:''}</p>
  <table><thead><tr><th>Tanggal Bayar</th><th>Nasabah</th><th>Nominal</th><th>Catatan</th><th aria-label="Aksi"/></tr></thead>
  <tbody>{rows.map((p:any)=><tr key={p.id}><td>{shortDate(p.paymentDate)}</td><td><b>{p.customerName}</b><small>{p.memberNumber}{isLegacyLoan(p)?' · pinjaman lama':''}</small></td><td><b>{rupiah(p.amount)}</b></td><td>{p.note||'—'}</td><td className="row-act"><IconButton icon={Pencil} onClick={()=>onEdit(p)} label={`Koreksi angsuran ${p.customerName} tanggal ${shortDate(p.paymentDate)}`}/><DeleteButton busy={deleting===`angsuran-${p.id}`} onClick={()=>onDelete(p)} label={`Hapus angsuran ${p.customerName}`}/></td></tr>)}</tbody>
  {rows.length>0&&<tfoot><tr><th colSpan={2}>Total setoran</th><th>{rupiah(total)}</th><th colSpan={2}/></tr></tfoot>}
  </table>
  <Empty show={!rows.length} text="Belum ada angsuran yang tercatat."/>
 </div>
}

function Dashboard({customers,totalDrop,totalPaid,outstanding,loans,targetPct,onDelete,deleting}:any){const stats=[{label:'Nasabah aktif',value:customers.toLocaleString('id-ID'),note:'anggota terdaftar',icon:Users,tone:'sky'},{label:'Total drop',value:rupiah(totalDrop),note:'pokok tersalurkan, tanpa pinjaman lama',icon:HandCoins,tone:'amber'},{label:'Storting masuk',value:rupiah(totalPaid),note:`${targetPct}% target tercapai, termasuk angsuran saldo lama`,icon:WalletCards,tone:'emerald'},{label:'Saldo berjalan',value:rupiah(outstanding),note:`${loans.filter((l:any)=>l.balance>0).length} tagihan aktif, termasuk pinjaman lama`,icon:Target,tone:'violet'}];return <><div className="welcome"><div><span>SEPTEMBER / 2026</span><h2>Kendali lapangan,<br/><em>tanpa menebak.</em></h2><p>Semua nasabah, angsuran, dan target kolektor berada dalam satu tampilan.</p></div><div className="welcome-number"><small>CAPAIAN STORTING</small><strong>{targetPct}<sup>%</sup></strong><i><span style={{width:`${targetPct}%`}}/></i></div></div><div className="stats">{stats.map((s:any)=><article key={s.label} data-tone={s.tone}><s.icon size={20}/><span>{s.label}</span><strong>{s.value}</strong><small>{s.note}</small></article>)}</div><div className="dashboard-grid"><article className="panel"><div className="panel-head"><div><small>PINJAMAN TERKINI</small><h3>Pergerakan portofolio</h3></div><span>{loans.length} transaksi</span></div>{loans.slice(0,5).map((l:any)=><div className="activity" key={l.id}><div className="person"><span>{l.customerName[0]}</span><div><b>{l.customerName}</b><small>{isLegacyLoan(l)?'Pinjaman lama':'Drop'} {shortDate(l.dropDate)}</small></div></div><div><b>{rupiah(isLegacyLoan(l)?l.totalDue:l.principal)}</b><Badge text={l.status}/><DeleteButton busy={deleting===`pinjaman-${l.id}`} onClick={()=>onDelete(l)} label={`Hapus pinjaman ${l.customerName}`}/></div></div>)}<Empty show={!loans.length} text="Transaksi pertama akan tampil di sini."/></article><article className="panel risk"><div className="panel-head"><div><small>PERLU PERHATIAN</small><h3>Calon macet & macet</h3></div><AlertTriangle size={20}/></div>{loans.filter((l:any)=>l.klas?.code==='CM'||l.klas?.code==='Macet').slice(0,4).map((l:any)=><div className="risk-row" key={l.id}><div><b>{l.customerName}</b><KlasBadge badge={l.klas}/><small>Jatuh tempo {shortDate(l.dueDate)}</small></div><strong>{rupiah(l.balance)}</strong></div>)}<Empty show={!loans.some((l:any)=>l.klas?.code==='CM'||l.klas?.code==='Macet')} text="Tidak ada tagihan calon macet maupun macet. Kerja bagus."/></article></div></>}
function SectionHead({eyebrow,title,text,search,setSearch,action}:any){return <div className="section-head"><div><span>{eyebrow}</span><h2>{title}</h2><p>{text}</p></div>{setSearch&&<label className="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari nama atau nomor..."/></label>}{action}</div>}
function Badge({text}:{text:string}){const cls=text==='Macet'?'danger':text==='Lunas'||text==='Aktif'||text==='Disetujui'?'good':'wait';return <span className={`badge ${cls}`}>{text}</span>}
function Empty({show,text}:{show:boolean,text:string}){return show?<div className="empty"><span>∅</span><p>{text}</p></div>:null}
function Modal({type,close,busy,submit,customers,loans,customer,payment}:any){const titles:any={nasabah:'Tambah nasabah',pinjaman:'Transaksi pinjaman',bayar:'Catat pembayaran',target:'Atur target harian',pengeluaran:'Catat pengeluaran',profil:'Identitas & usaha nasabah',angsuran:'Koreksi angsuran'};const handle=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);if(type==='nasabah')submit(()=>addCustomer({data:{memberNumber:String(f.get('memberNumber')),name:String(f.get('name')),address:String(f.get('address')),phone:String(f.get('phone')),nik:String(f.get('nik')),businessType:String(f.get('businessType')),businessAddress:String(f.get('businessAddress')),collector:String(f.get('collector')),resort:String(f.get('resort')),joinedAt:String(f.get('date')),legacyPrincipal:Math.round(Number(f.get('legacyPrincipal')||0)),legacyBalance:Math.round(Number(f.get('legacyBalance')||0))}}),'Nasabah berhasil ditambahkan.');if(type==='profil')submit(()=>updateCustomerProfile({data:{id:customer.id,nik:String(f.get('nik')),businessType:String(f.get('businessType')),businessAddress:String(f.get('businessAddress'))}}),`Identitas dan usaha ${customer.name} diperbarui.`);if(type==='pinjaman')submit(()=>addLoan({data:{customerId:Number(f.get('customerId')),principal:Math.round(Number(f.get('principal'))),dropDate:String(f.get('date')),dueDate:String(f.get('dueDate'))}}),'Pinjaman dan total 120% berhasil dicatat.');if(type==='bayar')submit(()=>addPayment({data:{loanId:Number(f.get('loanId')),amount:Math.round(Number(f.get('amount'))),paymentDate:String(f.get('date')),note:String(f.get('note'))}}),'Pembayaran tercatat dan sisa tagihan diperbarui. Klasifikasi nasabah tetap pada golongannya.');if(type==='angsuran'&&payment)submit(()=>updatePayment({data:{id:payment.id,paymentDate:String(f.get('date')),amount:Math.round(Number(f.get('amount'))),note:String(f.get('note'))}}),'Angsuran dikoreksi dan sisa tagihan diperbarui.');if(type==='target')submit(()=>saveTarget({data:{reportDate:String(f.get('date')),resort:String(f.get('resort')),collectionTarget:Math.round(Number(f.get('collectionTarget'))),dropTarget:Math.round(Number(f.get('dropTarget'))),notes:String(f.get('note'))}}),'Target harian berhasil disimpan.');if(type==='pengeluaran')submit(()=>addExpense({data:{category:String(f.get('category')),expenseDate:String(f.get('date')),amount:Math.round(Number(f.get('amount'))),note:String(f.get('note'))}}),'Pengeluaran berhasil dicatat.')};return <div className="modal-layer" role="dialog" aria-modal="true"><div className="modal"><div className="modal-head"><div><span>INPUT DATA</span><h2>{titles[type]}</h2></div><button onClick={close}><X/></button></div><form onSubmit={handle}>{type==='nasabah'&&<><div className="fields two"><Field label="No. anggota" name="memberNumber" placeholder="KOP-2026-001"/><Field label="Tanggal gabung" name="date" type="date" value={today}/></div><Field label="Nama lengkap" name="name" placeholder="Nama sesuai identitas"/><Field label="Alamat rumah" name="address" placeholder="Alamat tempat tinggal"/><Field label="NIK" name="nik" placeholder="16 angka sesuai KTP" hint="Ditulis 16 angka, tanpa spasi atau tanda baca."/><div className="fields two"><Field label="Jenis usaha" name="businessType" placeholder="Warung, pedagang pasar..." options={BUSINESS_KINDS}/><Field label="No. HP" name="phone" placeholder="08xxxxxxxxxx"/></div><Field label="Alamat usaha" name="businessAddress" placeholder="Alamat tempat usaha" required={false} hint="Kosongkan bila usahanya berada di alamat rumah."/><div className="fields two"><Field label="Kolektor" name="collector" placeholder="Nama kolektor"/><Field label="Nama resort" name="resort" placeholder="Resort Sukamaju"/></div><div className="fields two"><MoneyField label="Jumlah pinjaman nasabah lama" name="legacyPrincipal" required={false} hint="Nominal pinjaman lamanya di pembukuan sebelumnya. Kosongkan bila sama dengan saldonya."/><MoneyField label="Saldo nasabah lama" name="legacyBalance" required={false} hint="Sisa yang masih ditagih hari ini. Inilah tagihan yang diangsur di menu Angsuran."/></div><p className="field-note">Dua kotak di atas hanya untuk nasabah lama yang tagihannya dibawa dari pembukuan sebelumnya. Saldonya langsung dibukukan sebagai transaksi resmi: diangsur di menu Angsuran, dan angsurannya ikut masuk Storting, Tunai, serta Perkembangan. Jumlah pinjaman lamanya hanya keterangan nominal aslinya — uang itu keluar sebelum pembukuan ini, jadi tidak pernah dihitung sebagai drop kas. Kosongkan keduanya bila nasabahnya baru; angkanya masih bisa dicatat kapan saja dari menu Data Nasabah.</p></>}{type==='profil'&&customer&&<><div className="modal-note"><b>{customer.name}</b><small>{customer.memberNumber} · {customer.address}</small></div><Field label="NIK" name="nik" value={customer.nik} placeholder="16 angka sesuai KTP" hint="Ditulis 16 angka, tanpa spasi atau tanda baca."/><Field label="Jenis usaha" name="businessType" value={customer.businessType} placeholder="Warung, pedagang pasar..." options={BUSINESS_KINDS}/><Field label="Alamat usaha" name="businessAddress" value={customer.businessAddress} placeholder="Alamat tempat usaha" required={false} hint="Kosongkan bila usahanya berada di alamat rumah."/></>}{type==='pinjaman'&&<><Select label="Nasabah" name="customerId" options={customers.map((c:any)=>({value:c.id,label:`${c.memberNumber} — ${c.name}`}))}/><div className="fields two"><Field label="Tanggal drop" name="date" type="date" value={today}/><Field label="Jatuh tempo" name="dueDate" type="date"/></div><MoneyField label="Besar pinjaman" name="principal" hint="Total tagihan otomatis menjadi 120% dari pokok."/></>}{type==='bayar'&&<><Select label="Tagihan aktif" name="loanId" options={loans.filter((l:any)=>l.balance>0).map((l:any)=>({value:l.id,label:`${l.memberNumber} — ${l.customerName}${isLegacyLoan(l)?' (pinjaman lama)':''} · sisa ${rupiah(l.balance)}`}))}/><div className="fields two"><Field label="Tanggal bayar" name="date" type="date" value={today}/><MoneyField label="Jumlah bayar" name="amount" hint="Klasifikasi nasabah tidak berpindah karena setoran ini."/></div><Field label="Catatan" name="note" placeholder="Opsional" required={false}/></>}{type==='angsuran'&&payment&&<><div className="modal-note"><b>{payment.customerName}</b><small>{payment.memberNumber} · tercatat {shortDate(payment.paymentDate)} sebesar {rupiah(payment.amount)}</small></div><div className="fields two"><Field label="Tanggal bayar" name="date" type="date" value={payment.paymentDate}/><MoneyField label="Jumlah bayar" name="amount" value={payment.amount} hint={`Nominal terbesar yang bisa dicatat di baris ini ${rupiah(payment.maxAmount)}. Sisa tagihan nasabah langsung ikut terkoreksi.`}/></div><Field label="Catatan" name="note" value={payment.note} placeholder="Opsional" required={false} hint="Sebutkan alasan koreksinya bila perlu, mis. salah tulis nominal."/></>}{type==='target'&&<><div className="fields two"><Field label="Tanggal" name="date" type="date" value={today}/><Field label="Nama resort" name="resort" placeholder="Resort Sukamaju"/></div><MoneyField label="Target storting" name="collectionTarget"/><MoneyField label="Rencana drop" name="dropTarget"/><Field label="Catatan" name="note" placeholder="Fokus penagihan hari ini" required={false}/></>}{type==='pengeluaran'&&<><div className="fields two"><Field label="Jenis pengeluaran" name="category" placeholder="Bensin, makan, servis..." options={EXPENSE_KINDS}/><Field label="Tanggal pengeluaran" name="date" type="date" value={today}/></div><MoneyField label="Nominal pengeluaran" name="amount" hint="Nominal dalam rupiah, langsung masuk ke rekap Tunai."/><Field label="Catatan" name="note" placeholder="Opsional" required={false}/></>}<div className="modal-actions"><button type="button" className="secondary" onClick={close}>Batal</button><button className="primary" disabled={busy}>{busy?'Menyimpan...':'Simpan data'}</button></div></form></div></div>}
function Field({label,name,type='text',placeholder='',value,required=true,hint,options}:any){const listId=options?`${name}-pilihan`:undefined;return <label className="field"><span>{label}</span><input name={name} type={type} placeholder={placeholder} defaultValue={value} required={required} min={type==='number'?1:undefined} list={listId} autoComplete="off"/>{options&&<datalist id={listId}>{options.map((o:string)=><option key={o} value={o}/>)}</datalist>}{hint&&<small>{hint}</small>}</label>}
function Select({label,name,options}:any){return <label className="field"><span>{label}</span><select name={name} required><option value="">Pilih data</option>{options.map((o:any)=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>}

function MoneyInput({value,setValue,disabled,placeholder='0',autoFocus,ariaLabel,required}:any){
 const ref=useRef<HTMLInputElement>(null)
 function change(e:React.ChangeEvent<HTMLInputElement>){
  const el=e.currentTarget,caret=el.selectionStart??el.value.length
  const typedBefore=(el.value.slice(0,caret).match(/[\d,]/g)||[]).length
  const next=formatMoneyInput(el.value)
  setValue(next)
  requestAnimationFrame(()=>{
   const node=ref.current
   if(!node||node.value!==next)return
   let seen=0,pos=typedBefore?next.length:0
   for(let i=0;i<next.length;i++){if(/[\d,]/.test(next[i]))seen++;if(seen===typedBefore){pos=i+1;break}}
   node.setSelectionRange(pos,pos)
  })
 }
 return <input ref={ref} value={value} onChange={change} disabled={disabled} required={required} placeholder={placeholder} autoFocus={autoFocus} aria-label={ariaLabel} type="text" inputMode="decimal" autoComplete="off"/>
}

// `value` dipakai form koreksi supaya nominal lama sudah terisi dan pengelola
// hanya membetulkan angkanya, bukan menulis ulang dari nol.
function MoneyField({label,name,hint,required=true,value}:any){
 const [raw,setRaw]=useState(value?formatMoneyInput(String(Math.round(value))):'')
 const amount=parseMoneyInput(raw)
 return <label className="field money-field"><span>{label}</span><div className="money-input"><b>Rp</b><MoneyInput value={raw} setValue={setRaw} required={required} ariaLabel={label}/></div><input type="hidden" name={name} value={raw?String(Math.round(amount)):''}/><small>{raw?`${rupiah(Math.round(amount))}${hasDecimal(raw)?` · ${decimal(amount)} dibulatkan ke rupiah penuh`:''}`:hint||'Titik ribuan muncul otomatis, koma untuk desimal.'}</small></label>
}

/* ===== Menu Angsuran: posisi tagihan dan klasifikasi status nasabah =====
   Klasifikasi PB → L → CM → Macet ditentukan server dan diturunkan penjadwal
   tutup bulan. Layar ini menampilkan statusnya, menyaring daftar menurut
   klasifikasi, dan menyediakan penyesuaian manual bila pengelola perlu
   membetulkan status seorang nasabah. */
function AngsuranView({rows,total,tally,filter,setFilter,payDraft,setPayDraft,payingId,onPay,onKlas,klasSaving,closing,onClosing,onForm,log,onEditPayment,onDeletePayment,deleting,statusLogs}:any){
 const cards=[...CLASSIFICATIONS.map(code=>({key:code as string,text:code as string,tone:CLASSIFICATION_TONE[code],label:CLASSIFICATION_NAME[code],value:tally.counts[code],note:CLASSIFICATION_HINT[code]})),{key:'lunas',text:RECOVERED_LABEL,tone:'lunas',label:'Tunggakan diselesaikan',value:tally.settled,note:'Tagihan CM atau Macet yang sisanya sudah nol. Klasifikasinya tetap, hanya diberi penanda.'}]
 return <>
  <SectionHead eyebrow="ANGSURAN" title="Posisi tagihan & klasifikasi status" text="Isi nominal di samping nama nasabah lalu tekan Enter — pembayaran langsung tersimpan. Pinjaman nasabah lama ikut di daftar ini: setoranya mengurangi tagihannya sendiri, tapi tidak masuk Storting, Tunai, maupun Perkembangan. Setoran tidak memindahkan klasifikasi — nasabah tetap pada golongannya meski sudah membayar. Perpindahan hanya terjadi pada tutup bulan (PB naik ke L, L yang menunggak turun ke CM, CM yang masih menunggak turun ke Macet) atau lewat penyesuaian manual pengelola." action={<div className="klas-tools">
   <label className="field date-pick"><span>Klasifikasi status</span><select value={filter} onChange={e=>setFilter(e.target.value)}>{KLAS_FILTERS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}</select></label>
   <div className="klas-tool-actions"><button type="button" className="text-button" onClick={onForm}>Form lengkap dengan catatan <ArrowUpRight size={15}/></button><button type="button" className="secondary" disabled={closing} title="Menjalankan transisi tutup bulan yang sama dengan penjadwal tanggal 30" onClick={onClosing}>{closing?<><Loader2 size={15} className="spin"/>Menjalankan...</>:<><RefreshCw size={15}/>Jalankan transisi</>}</button></div>
  </div>}/>
  <div className="klas-stats">{cards.map(c=><button type="button" key={c.key} className={filter===c.key?'klas-card active':'klas-card'} data-klas={c.tone} title={c.note} onClick={()=>setFilter(filter===c.key?'semua':c.key)}><span className={`badge klas ${c.tone}`}>{c.text}</span><strong>{c.value.toLocaleString('id-ID')}</strong><small>{c.label}</small></button>)}</div>
  {filter!=='semua'&&<p className="klas-scope"><ShieldAlert size={15}/>Menampilkan {rows.length} dari {total} tagihan · {klasFilterLabel(filter)}<button type="button" className="text-button" onClick={()=>setFilter('semua')}>Tampilkan semua</button></p>}
  <div className="pay-list">{rows.map((l:any)=><article className={l.balance>0?'pay-row':'pay-row done'} key={l.id}>
   <div className="pay-id"><div className="person"><span>{l.customerName[0]}</span><div><b>{l.customerName}</b><small>{l.memberNumber} · jatuh tempo {shortDate(l.dueDate)}</small></div></div>{isLegacyLoan(l)&&<span className="chip lama">Pinjaman lama</span>}<KlasBadge badge={l.klas}/><Badge text={l.status}/></div>
   <div className="pay-figures"><div className="balance"><span>Sisa tagihan</span><strong>{rupiah(l.balance)}</strong></div><div className="progress"><i style={{width:`${Math.round(l.paid/l.totalDue*100)}%`}}/></div><div className="loan-meta"><span>Terbayar <b>{rupiah(l.paid)}</b></span><span>Total tagihan <b>{rupiah(l.totalDue)}</b></span></div></div>
   <KlasCell loan={l} onKlas={onKlas} busy={klasSaving===l.id}/>
   <div className="pay-act">{l.balance>0?<InlinePay loan={l} value={payDraft[l.id]||''} setValue={(v:string)=>setPayDraft((d:any)=>({...d,[l.id]:v}))} onSave={()=>onPay(l)} busy={payingId===l.id}/>:<div className="pay-done"><CheckCircle2 size={16}/>Sudah lunas</div>}</div>
  </article>)}<Empty show={!rows.length} text={total?`Tidak ada tagihan berklasifikasi ${klasFilterLabel(filter)}.`:'Belum ada pinjaman aktif.'}/></div>
  <StatusLogPanel rows={statusLogs}/>
  <PaymentLog rows={log} onEdit={onEditPayment} onDelete={onDeletePayment} deleting={deleting}/>
 </>
}

/** Nada warna dari nilai klasifikasi apa pun yang tersimpan, termasuk jejak lama. */
const klasTone=(value:string)=>CLASSIFICATION_TONE[value as keyof typeof CLASSIFICATION_TONE]??'pb'

/**
 * Badge klasifikasi: PB biru, L hijau, CM kuning, Macet merah. Golongannya tidak
 * pernah ditimpa keadaan pembayaran; tagihan CM atau Macet yang sisanya sudah
 * nol hanya mendapat penanda Lunas Macet di sampingnya.
 */
function KlasBadge({badge}:any){return <><span className={`badge klas ${badge.tone}`} title={`${badge.code} · ${CLASSIFICATION_HINT[badge.code as keyof typeof CLASSIFICATION_HINT]}`}>{badge.label}</span>{badge.settled&&<span className="badge klas lunas" title={`${RECOVERED_LABEL} — tagihannya sudah habis, tapi klasifikasinya tetap ${badge.code} sampai pengelola menyesuaikannya.`}>{RECOVERED_LABEL}</span>}</>}

/**
 * Sel klasifikasi satu tagihan: statusnya, alasan status itu bertahan (kewajiban
 * periode berjalan dan kekurangannya), lalu pilihan penyesuaian manual. Status
 * yang dipilih di sini dipakai sebagai titik awal jenjang bulan berikutnya, jadi
 * otomatisasinya tidak mati karena dibetulkan sekali.
 */
function KlasCell({loan,onKlas,busy}:any){
 const a=loan.arrears
 const note=loan.balance<=0
  ?`Tagihan lunas${loan.lastPaymentDate?` · setoran terakhir ${shortDate(loan.lastPaymentDate)}`:''}`
  :a.shortfall>0
   ?`Kurang ${rupiah(a.shortfall)} dari kewajiban ${rupiah(a.required)} bulan ini`
   :`Kewajiban ${rupiah(a.required)} bulan ini sudah terpenuhi`
 const source=loan.classificationSource==='manual'?'disesuaikan pengelola':loan.classificationSource==='pembayaran'?'dari setoran nasabah':'otomatis tutup bulan'
 return <div className="pay-klas">
  <div className="klas-head"><span>KLASIFIKASI</span><KlasBadge badge={loan.klas}/></div>
  <small className={loan.balance>0&&a.delinquent?'klas-note late':'klas-note'}>{note}</small>
  {loan.balance>0&&<small className="klas-note">Angsuran {rupiah(loan.perBulan)}/bulan · masuk {rupiah(loan.paidInPeriod)} bulan ini</small>}
  <small className="klas-note">{source}{loan.classifiedAt?` · ${shortDate(loan.classifiedAt)}`:''}{a.pastDue?' · lewat jatuh tempo':''}</small>
  <label className="klas-pick"><span>Sesuaikan status</span>
   <select value={loan.klas.code} disabled={busy} aria-label={`Sesuaikan klasifikasi ${loan.customerName}`} onChange={e=>{if(e.target.value!==loan.klas.code)onKlas(loan,e.target.value)}}>{CLASSIFICATIONS.map(c=><option key={c} value={c}>{c} — {CLASSIFICATION_NAME[c]}</option>)}</select>
   {busy&&<Loader2 size={14} className="spin"/>}
  </label>
 </div>
}

/** Jejak perpindahan klasifikasi, termasuk yang dikerjakan penjadwal tutup bulan. */
function StatusLogPanel({rows}:any){
 return <div className="table-card status-log">
  <div className="card-head"><div><small>RIWAYAT KLASIFIKASI</small><h3>Perpindahan status</h3></div><span><History size={15}/>{rows.length} catatan terakhir</span></div>
  <table><thead><tr><th>Tanggal</th><th>Nasabah</th><th>Perpindahan</th><th>Sumber</th><th>Alasan</th></tr></thead>
  <tbody>{rows.map((r:any)=><tr key={r.id}>
   <td>{shortDate(r.effectiveDate)}</td>
   <td><b>{r.customerName||'Nasabah terhapus'}</b><small>{r.memberNumber||'—'}</small></td>
   <td className="klas-move"><span className={`badge klas ${klasTone(r.fromStatus)}`}>{r.fromStatus}</span><ArrowUpRight size={14}/><span className={`badge klas ${klasTone(r.toStatus)}`}>{r.toStatus}</span></td>
   <td>{r.source==='manual'?'Pengelola':r.source==='pembayaran'?'Setoran':'Tutup bulan'}</td>
   <td>{r.reason||'—'}</td>
  </tr>)}</tbody></table>
  <Empty show={!rows.length} text="Belum ada perpindahan klasifikasi yang tercatat."/>
 </div>
}

function InlinePay({loan,value,setValue,onSave,busy}:any){
 const amount=parseMoneyInput(value)
 const over=Math.round(amount)>loan.balance
 return <form className="inline-pay" onSubmit={e=>{e.preventDefault();if(!busy&&amount>0&&!over)onSave()}}>
  <span className="inline-pay-label">SETOR HARI INI</span>
  <div className={over?'money-input inline over':'money-input inline'}><b>Rp</b><MoneyInput value={value} setValue={setValue} disabled={busy} ariaLabel={`Nominal pembayaran ${loan.customerName}`}/><button type="submit" disabled={busy||amount<=0||over} aria-label={`Simpan pembayaran ${loan.customerName}`}>{busy?<Loader2 size={15} className="spin"/>:<Check size={15}/>}</button></div>
  <small className={over?'over-text':''}>{busy?'Menyimpan pembayaran...':over?`Maksimal ${rupiah(loan.balance)}`:amount>0?`${rupiah(Math.round(amount))} · tekan Enter untuk simpan`:'Ketik nominal, lalu tekan Enter'}</small>
 </form>
}

/* ===== Menu Data Nasabah: master anggota plus jumlah pinjaman nasabah lama =====
   Jumlah pinjaman lama di sini hanya cermin dari transaksinya di menu Transaksi.
   Angka yang tampil selalu dihitung dari tagihan dikurangi angsuran yang sudah
   masuk, jadi setoran yang dicatat di menu Angsuran langsung terlihat di kolom
   ini. Kolomnya terbuka untuk semua nasabah: yang terdaftar tanpa pinjaman lama
   bisa dicatatkan jumlahnya di sini kapan saja. Uang pinjaman lama sudah keluar
   sebelum aplikasi ini dipakai, jadi angsurannya berada di luar Storting, Tunai,
   dan Perkembangan. */
function CustomerView({rows,summary,incomplete,legacyOnly,setLegacyOnly,search,setSearch,loans,onDelete,onEdit,deleting,onSaveLegacy,savingLegacy}:any){
 const stats=[
  ...(incomplete>0?[{label:'Data belum lengkap',value:incomplete.toLocaleString('id-ID'),note:'NIK atau jenis usaha masih kosong',icon:IdCard,tone:'rose'}]:[]),
  {label:'Nasabah lama',value:summary.members.toLocaleString('id-ID'),note:`${summary.cleared} pinjaman lamanya sudah lunas`,icon:Users,tone:'sky'},
  {label:'Jumlah pinjaman lama',value:rupiah(summary.principal),note:'nominal pinjaman di pembukuan sebelumnya',icon:Wallet,tone:'amber'},
  {label:'Sisa saldo lama',value:rupiah(summary.balance),note:`dari ${rupiah(summary.booked)} saldo yang dibukukan`,icon:PiggyBank,tone:'violet'},
  {label:'Sudah terbayar',value:rupiah(summary.settled),note:'angsuran saldo lama, ikut dihitung sebagai storting',icon:CheckCircle2,tone:'emerald'},
 ]
 return <>
  <SectionHead eyebrow="MASTER DATA" title="Daftar nasabah" text="Identitas, profil usaha, jumlah pinjaman nasabah lama, dan saldonya dalam satu daftar. Keduanya bisa dicatat atau dibetulkan langsung di kolomnya, termasuk untuk nasabah yang sebelumnya terdaftar tanpa pinjaman lama. Saldonya menjadi transaksi resmi yang diangsur di menu Angsuran dan angsurannya ikut masuk Storting, Tunai, serta Perkembangan; jumlah pinjaman lamanya hanya keterangan, tidak pernah dihitung sebagai drop kas." search={search} setSearch={setSearch} action={<button className="text-button" onClick={()=>setLegacyOnly(!legacyOnly)}>{legacyOnly?'Tampilkan semua nasabah':'Hanya nasabah lama'}<ArrowUpRight size={15}/></button>}/>
  {(summary.members>0||incomplete>0)&&<div className="stats">{stats.map((s:any)=><article key={s.label} data-tone={s.tone}><s.icon size={20}/><span>{s.label}</span><strong>{s.value}</strong><small>{s.note}</small></article>)}</div>}
  <div className="table-card customer-table">
   <table><thead><tr><th>No. Anggota</th><th>Nasabah</th><th>NIK</th><th>Jenis Usaha</th><th>Kolektor / Resort</th><th>Tanggal Gabung</th><th>Pinjaman Lama & Saldo</th><th>Status</th><th aria-label="Aksi"/></tr></thead>
   <tbody>{rows.map((c:any)=>{const milik=loans.filter((l:any)=>l.customerId===c.id),klas=worstClassification(milik);return <tr key={c.id}>
    <td><b>{c.memberNumber}</b></td>
    <td><div className="person"><span>{c.name.charAt(0)}</span><div><b>{c.name}</b><small>{c.phone} · {c.address}</small></div></div></td>
    <td>{c.nik?<b className="nik">{formatNik(c.nik)}</b>:<em className="row-none" title="NIK belum diisi">Belum diisi</em>}</td>
    <td>{c.businessType
      ?<div className="usaha"><b>{c.businessType}</b><small>{c.businessAddress||'Usaha di alamat rumah'}</small></div>
      :<em className="row-none" title="Jenis usaha belum diisi">Belum diisi</em>}</td>
    <td>{c.collector}<small>{c.resort}</small></td>
    <td>{shortDate(c.joinedAt)}</td>
    <td><LegacyBalance key={`saldo-${c.id}-${c.legacy?.balance??0}-${c.legacy?.totalDue??0}`} customer={c} onSave={onSaveLegacy} busy={savingLegacy===c.id}/></td>
    <td>{c.isLegacy&&<span className="chip lama">Nasabah lama</span>}{klas&&<span className={`badge klas ${klasTone(klas)}`} title={`Klasifikasi tagihan terberat: ${CLASSIFICATION_NAME[klas]}`}>{klas}</span>}<Badge text={milik.some((l:any)=>l.status==='Macet')?'Macet':c.status}/></td>
    <td className="row-act"><IconButton icon={Pencil} onClick={()=>onEdit(c)} label={`Ubah identitas dan usaha ${c.name}`}/><DeleteButton busy={deleting===`nasabah-${c.id}`} onClick={()=>onDelete(c)} label={`Hapus nasabah ${c.name}`}/></td>
   </tr>})}</tbody></table>
   <Empty show={!rows.length} text={legacyOnly?'Belum ada nasabah lama dengan sisa saldo.':'Belum ada nasabah yang cocok.'}/>
  </div>
 </>
}

/**
 * Sel pinjaman nasabah lama: jumlah pinjamannya dan saldo yang masih ditagih.
 * Angka besarnya dibaca dari transaksi pinjaman lamanya, jadi berkurang sendiri
 * setiap kali angsuran masuk.
 *
 * Selnya punya dua keadaan. Untuk nasabah yang belum punya pinjaman lama
 * (`fresh`), kedua kotak mencatatkannya pertama kali — berguna bagi nasabah yang
 * dulu didaftarkan tanpa mengisi saldo bawaannya. Untuk yang sudah punya,
 * kotaknya membetulkan angka yang salah catat: jumlah pinjaman dan saldo
 * tersimpan bersama dalam satu kali kirim. Setoran nasabah tetap dicatat di menu
 * Angsuran, dan angsurannya ikut dihitung sebagai storting seperti angsuran
 * pinjaman baru; hanya jumlah pinjaman lamanya yang tidak pernah menjadi drop kas.
 */
function LegacyBalance({customer,onSave,busy}:any){
 const loan=customer.legacy
 const fresh=!loan
 const balance=loan?.balance??0
 const booked=loan?.totalDue??0
 const principal=loan?.principal??customer.legacyOpening
 const [saldo,setSaldo]=useState(balance?formatMoneyInput(String(balance)):'')
 const [pokok,setPokok]=useState(principal?formatMoneyInput(String(principal)):'')
 const amount=Math.round(parseMoneyInput(saldo))
 const pinjaman=Math.round(parseMoneyInput(pokok))
 const progress=legacyProgress(loan)
 const dirty=amount!==balance||pinjaman!==principal
 return <form className={fresh?'legacy-cell fresh':'legacy-cell'} onSubmit={e=>{e.preventDefault();if(!busy&&dirty)onSave(customer,pinjaman,amount)}}>
  {!fresh&&<>
   <b>{rupiah(balance)}</b>
   <small>{balance?`saldo dari pinjaman ${rupiah(principal)} · ${progress}% dari ${rupiah(booked)} terbayar`:`Lunas dari pinjaman ${rupiah(principal)}`}</small>
   <div className="progress"><i style={{width:`${progress}%`}}/></div>
  </>}
  <div className="legacy-fields">
   <label><span>Jumlah pinjaman</span><div className="money-input inline"><b>Rp</b><MoneyInput value={pokok} setValue={setPokok} disabled={busy} ariaLabel={`Jumlah pinjaman lama ${customer.name}`}/></div></label>
   <label><span>Saldo ditagih</span><div className="money-input inline"><b>Rp</b><MoneyInput value={saldo} setValue={setSaldo} disabled={busy} ariaLabel={`Saldo nasabah lama ${customer.name}`}/><button type="submit" disabled={busy||!dirty} aria-label={fresh?`Catat pinjaman lama ${customer.name}`:`Simpan pinjaman lama ${customer.name}`}>{busy?<Loader2 size={15} className="spin"/>:<Check size={15}/>}</button></div></label>
  </div>
  <small className="legacy-hint">{busy?'Menyimpan pinjaman lama...':dirty?`Tekan Enter untuk ${fresh?'mencatat':'menyimpan'} jumlah ${rupiah(pinjaman||amount)} dengan saldo ${rupiah(amount)}`:fresh?'Isi bila nasabahnya membawa pinjaman dari pembukuan lama. Saldonya yang ditagih, dan angsurannya ikut masuk storting, tunai, serta perkembangan.':'Setoran nasabah dicatat di menu Angsuran. Kedua kotak ini hanya untuk membetulkan angka yang salah catat.'}</small>
 </form>
}

/* ===== Menu Tunai: storting, kasbon, drop 90%, pengeluaran, titipan, dan hasil tunai ===== */
function CashView({date,setDate,summary,record,history,records,onSave,onDelete,deleting,busy}:any){
 const [kasbon,setKasbon]=useState(record?.kasbon?formatMoneyInput(String(record.kasbon)):'')
 const [titipan,setTitipan]=useState(record?.titipan?formatMoneyInput(String(record.titipan)):'')
 const kasbonAmt=Math.round(parseMoneyInput(kasbon)),titipanAmt=Math.round(parseMoneyInput(titipan))
 const tunai=summary.storting+kasbonAmt-summary.dropCash-summary.pengeluaran-titipanAmt
 const posisi=cashPosition(tunai)
 const tersedia=summary.storting+kasbonAmt-summary.dropCash-summary.pengeluaran
 const overTitipan=titipanAmt>Math.max(0,tersedia)
 const dirty=kasbonAmt!==summary.kasbon||titipanAmt!==summary.titipan
 const cards=[
  {key:'storting',label:'Storting',value:summary.storting,note:'Seluruh angsuran yang masuk pada tanggal ini',icon:WalletCards,mode:'auto',sign:'+',tone:'emerald'},
  ...(summary.stortingLama?[{key:'lama',label:'Angsuran saldo lama',value:summary.stortingLama,note:'Rincian asal storting, sudah termasuk di angka storting',icon:Banknote,mode:'info',sign:'',tone:'violet'}]:[]),
  {key:'kasbon',label:'Kasbon',value:kasbonAmt,note:'Tambahan uang dari kantor, diisi manual',icon:HandCoins,mode:'manual',sign:'+',tone:'sky',draft:kasbon,setDraft:setKasbon},
  {key:'drop',label:`Drop (${DROP_PCT}%)`,value:summary.dropCash,note:`${rupiah(summary.dropGross)} pokok drop × ${DROP_PCT}%`,icon:ArrowDownRight,mode:'auto',sign:'−',tone:'amber'},
  {key:'pengeluaran',label:'Pengeluaran',value:summary.pengeluaran,note:'Total pengeluaran dari menu Pengeluaran',icon:Receipt,mode:'auto',sign:'−',tone:'rose'},
  {key:'titipan',label:'Titipan',value:titipanAmt,note:'Sisa uang yang dibawa pulang, diisi manual',icon:PiggyBank,mode:'manual',sign:'−',tone:'violet',draft:titipan,setDraft:setTitipan},
 ]
 return <>
  <SectionHead eyebrow="KAS HARIAN" title="Rekap tunai" text={`Tunai = storting + kasbon − drop ${DROP_PCT}% − pengeluaran − titipan. Hasil plus berarti Tekor, hasil minus berarti Lebih. Storting hanya menghitung angsuran pinjaman baru — angsuran pinjaman nasabah lama dilaporkan terpisah, di luar rumus ini.`} action={<label className="field date-pick"><span>Tanggal kas</span><input type="date" value={date} onChange={e=>setDate(e.target.value||today)} max={today}/></label>}/>
  <article className={`cash-result tone-${posisi.tone}`}>
   <div className="cash-verdict"><span>POSISI TUNAI · {shortDate(date)}</span><em className={`verdict-chip ${posisi.tone}`}>{posisi.tone==='lebih'?<ArrowDownRight size={15}/>:posisi.tone==='tekor'?<ArrowUpRight size={15}/>:<Check size={15}/>}{posisi.label}</em><strong>{rupiah(posisi.nominal)}</strong><small>{posisi.caption}</small></div>
   <div className="cash-formula">
    <span>Storting<b>{rupiah(summary.storting)}</b></span><i>+</i>
    <span>Kasbon<b>{rupiah(kasbonAmt)}</b></span><i>−</i>
    <span>Drop {DROP_PCT}%<b>{rupiah(summary.dropCash)}</b></span><i>−</i>
    <span>Pengeluaran<b>{rupiah(summary.pengeluaran)}</b></span><i>−</i>
    <span>Titipan<b>{rupiah(titipanAmt)}</b></span><i>=</i>
    <strong>{rupiah(tunai)}</strong>
   </div>
  </article>
  <div className="cash-grid">
   {cards.map((c:any)=><article className={c.mode==='manual'?'cash-card manual':'cash-card'} data-tone={c.tone} key={c.key}>
    <header><c.icon size={18}/><span>{c.label}</span><em className={c.mode==='manual'?'tag manual':'tag'}>{c.mode==='manual'?'MANUAL':c.mode==='info'?'DI LUAR RUMUS':'OTOMATIS'}</em></header>
    {c.mode==='manual'
      ?<div className={c.key==='titipan'&&overTitipan?'money-input over':'money-input'}><b>Rp</b><MoneyInput value={c.draft} setValue={c.setDraft} disabled={busy} ariaLabel={c.label}/></div>
      :<strong className={c.sign==='−'?'minus':''}>{c.sign==='−'?`− ${rupiah(c.value)}`:rupiah(c.value)}</strong>}
    <small className={c.key==='titipan'&&overTitipan?'warn':''}>{c.key==='titipan'&&overTitipan?`Kas tersedia hari ini hanya ${rupiah(Math.max(0,tersedia))}.`:c.note}</small>
   </article>)}
   <article className={`cash-card total tone-${posisi.tone}`}>
    <header><Wallet size={18}/><span>Posisi tunai</span><em className="tag">{posisi.label.toUpperCase()}</em></header>
    <strong>{rupiah(posisi.nominal)}</strong>
    <small>Hasil {rupiah(tunai)} · storting + kasbon − drop {DROP_PCT}% − pengeluaran − titipan</small>
   </article>
  </div>
  <div className="cash-save">
   <p className={overTitipan?'warn':''}>{overTitipan?`Titipan melebihi kas tersedia (${rupiah(Math.max(0,tersedia))}), posisi kas menjadi Lebih. Periksa dulu sebelum menyimpan.`:dirty?'Perubahan kasbon atau titipan belum tersimpan.':'Kasbon dan titipan tanggal ini sudah tersimpan.'}</p>
   <button className="primary" disabled={busy||!dirty} onClick={()=>onSave(kasbonAmt,titipanAmt)}>{busy?<><Loader2 size={15} className="spin"/>Menyimpan...</>:<><Check size={16}/>Simpan kasbon & titipan</>}</button>
  </div>
  <div className="table-card cash-history">
   <table><thead><tr><th>Tanggal</th><th>Storting</th><th>Angsuran Lama</th><th>Kasbon</th><th>Drop {DROP_PCT}%</th><th>Pengeluaran</th><th>Titipan</th><th>Selisih</th><th>Posisi</th><th aria-label="Aksi"/></tr></thead>
   <tbody>{history.map((h:any)=>{const p=cashPosition(h.tunai),saved=records?.find((c:any)=>c.reportDate===h.date);return <tr key={h.date} className={h.date===date?'row-active':''}><td><b>{shortDate(h.date)}</b></td><td>{rupiah(h.storting)}</td><td className="muted-cell" title="Bagian storting yang berasal dari angsuran saldo nasabah lama">{rupiah(h.stortingLama)}</td><td>{rupiah(h.kasbon)}</td><td>{rupiah(h.dropCash)}</td><td>{rupiah(h.pengeluaran)}</td><td>{rupiah(h.titipan)}</td><td><b className={`amount ${p.tone}`}>{rupiah(p.nominal)}</b></td><td><span className={`chip ${p.tone}`}>{p.label}</span></td><td className="row-act">{saved?<DeleteButton busy={deleting===`tunai-${saved.id}`} onClick={()=>onDelete(saved)} label={`Hapus kasbon dan titipan ${shortDate(h.date)}`}/>:<em className="row-none" title="Tidak ada angka manual yang bisa dihapus pada tanggal ini">—</em>}</td></tr>})}</tbody></table>
   <Empty show={!history.length} text="Belum ada aktivitas kas yang bisa direkap."/>
  </div>
 </>
}

/* ===== Menu Pengeluaran: jenis, tanggal, nominal, dan totalnya ===== */
function ExpenseView({rows,todayTotal,shownTotal,filter,setFilter,onAdd,onDelete,deleting}:any){
 const stats=[
  {label:'Pengeluaran hari ini',value:rupiah(todayTotal),note:'mengurangi tunai hari ini',icon:Receipt,tone:'rose'},
  {label:filter?`Total ${shortDate(filter)}`:'Total pengeluaran',value:rupiah(shownTotal),note:filter?'sesuai tanggal terpilih':'seluruh pengeluaran tercatat',icon:Wallet,tone:'amber'},
  {label:'Jumlah catatan',value:rows.length.toLocaleString('id-ID'),note:'baris pengeluaran',icon:Banknote,tone:'sky'},
 ]
 return <>
  <SectionHead eyebrow="PENGELUARAN" title="Catatan pengeluaran" text="Jenis, tanggal, dan nominal pengeluaran. Totalnya otomatis dipakai menu Tunai." action={<div className="expense-tools"><label className="field date-pick"><span>Filter tanggal</span><input type="date" value={filter} onChange={e=>setFilter(e.target.value)}/></label>{filter&&<button className="text-button" onClick={()=>setFilter('')}>Tampilkan semua</button>}</div>}/>
  <div className="stats">{stats.map((s:any)=><article key={s.label} data-tone={s.tone}><s.icon size={20}/><span>{s.label}</span><strong>{s.value}</strong><small>{s.note}</small></article>)}</div>
  <div className="table-card">
   <table><thead><tr><th>Jenis Pengeluaran</th><th>Tanggal</th><th>Nominal</th><th aria-label="Aksi"/></tr></thead>
   <tbody>{rows.map((e:any)=><tr key={e.id}><td><b>{e.category}</b>{e.note&&<small>{e.note}</small>}</td><td>{shortDate(e.expenseDate)}</td><td><b>{rupiah(e.amount)}</b></td><td className="row-act"><DeleteButton busy={deleting===`pengeluaran-${e.id}`} onClick={()=>onDelete(e)} label={`Hapus pengeluaran ${e.category}`}/></td></tr>)}</tbody>
   {rows.length>0&&<tfoot><tr><th colSpan={2}>Total Pengeluaran</th><th>{rupiah(shownTotal)}</th><th/></tr></tfoot>}
   </table>
   <Empty show={!rows.length} text={filter?'Tidak ada pengeluaran pada tanggal ini.':'Belum ada pengeluaran tercatat.'}/>
  </div>
  <button className="primary expense-add" onClick={onAdd}><Plus size={17}/>Pengeluaran baru</button>
 </>
}

/* ===== Menu Perkembangan: laba rugi dari jasa angsuran dikurangi beban operasional ===== */
const RANGES=[{value:'6',label:'6 bulan terakhir'},{value:'12',label:'12 bulan terakhir'},{value:'all',label:'Seluruh periode'}]
function ProgressView({rows,totals,breakdown,range,setRange,loans}:any){
 const tone=profitTone(totals.laba)
 const scope=rows.length?`${periodLabel(rows[rows.length-1].period)} – ${periodLabel(rows[0].period)}`:'Belum ada periode'
 const bebanTotal=breakdown.reduce((n:number,b:any)=>n+b.amount,0)
 const stats=[
  {label:'Pendapatan jasa',value:rupiah(totals.pendapatan),note:`porsi jasa dari ${rupiah(totals.storting)} storting yang masuk`,icon:HandCoins,tone:'sky'},
  {label:'Beban operasional',value:rupiah(totals.beban),note:'seluruh pengeluaran pada rentang ini',icon:Receipt,tone:'rose'},
  {label:'Margin laba',value:`${totals.margin}%`,note:'laba bersih dibanding pendapatan jasa',icon:TrendingUp,tone:'emerald'},
  {label:'Potensi jasa',value:rupiah(totals.potensiJasa),note:`belum terealisasi dari ${loans} pinjaman`,icon:PiggyBank,tone:'violet'},
 ]
 return <>
  <SectionHead eyebrow="PERKEMBANGAN" title="Laba rugi koperasi" text="Jasa pinjaman diakui saat angsuran benar-benar masuk — setiap setoran dipecah menjadi pengembalian pokok dan pendapatan jasa, lalu dikurangi beban operasional bulan yang sama. Angsuran saldo nasabah lama ikut dihitung di sini, dipecah menurut selisih saldonya dengan jumlah pinjaman lamanya; jumlah pinjaman lamanya sendiri tidak pernah masuk sebagai modal yang disalurkan periode ini." action={<div className="pnl-tools"><label className="field date-pick"><span>Rentang periode</span><select value={range} onChange={e=>setRange(e.target.value)}>{RANGES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select></label></div>}/>
  <article className={`cash-result pnl-result tone-${tone.tone}`}>
   <div className="cash-verdict"><span>POSISI LABA RUGI · {scope}</span><em className={`verdict-chip ${tone.tone}`}>{tone.tone==='laba'?<TrendingUp size={15}/>:tone.tone==='rugi'?<TrendingDown size={15}/>:<Check size={15}/>}{tone.label}</em><strong>{rupiah(Math.abs(totals.laba))}</strong><small>{tone.tone==='laba'?'Pendapatan jasa masih di atas beban operasional pada rentang ini.':tone.tone==='rugi'?'Beban operasional melampaui pendapatan jasa, periksa rincian beban di bawah.':'Pendapatan jasa dan beban operasional persis seimbang.'}</small></div>
   <div className="cash-formula">
    <span>Pendapatan jasa<b>{rupiah(totals.pendapatan)}</b></span><i>−</i>
    <span>Beban operasional<b>{rupiah(totals.beban)}</b></span><i>=</i>
    <strong>{rupiah(totals.laba)}</strong>
   </div>
  </article>
  <div className="stats">{stats.map((s:any)=><article key={s.label} data-tone={s.tone}><s.icon size={20}/><span>{s.label}</span><strong>{s.value}</strong><small>{s.note}</small></article>)}</div>
  {rows.length>1&&<div className="viz-row"><IncomeExpenseChart rows={rows}/><NetProfitChart rows={rows}/></div>}
  <div className="pnl-tables">
   <div className="table-card">
    <table><thead><tr><th>Periode</th><th>Storting</th><th>Angsuran Lama</th><th>Pengembalian Pokok</th><th>Pendapatan Jasa</th><th>Beban</th><th>Laba / Rugi</th><th>Posisi</th></tr></thead>
    <tbody>{rows.map((r:any)=>{const t=profitTone(r.laba);return <tr key={r.period}><td><b>{periodLabel(r.period)}</b></td><td>{rupiah(r.storting)}</td><td className="muted-cell" title="Bagian storting yang berasal dari angsuran saldo nasabah lama">{rupiah(r.stortingLama)}</td><td>{rupiah(r.pokok)}</td><td>{rupiah(r.pendapatan)}</td><td>{rupiah(r.beban)}</td><td><b className={`amount ${t.tone}`}>{rupiah(r.laba)}</b></td><td><span className={`chip ${t.tone}`}>{t.label}</span></td></tr>})}</tbody>
    {rows.length>0&&<tfoot><tr><th>Total {rows.length} bulan</th><th>{rupiah(totals.storting)}</th><th>{rupiah(totals.stortingLama)}</th><th>{rupiah(totals.pokok)}</th><th>{rupiah(totals.pendapatan)}</th><th>{rupiah(totals.beban)}</th><th>{rupiah(totals.laba)}</th><th/></tr></tfoot>}
    </table>
    <Empty show={!rows.length} text="Belum ada angsuran atau pengeluaran yang bisa dihitung."/>
   </div>
   <div className="table-card">
    <table><thead><tr><th>Jenis Beban</th><th>Nominal</th><th>Porsi</th></tr></thead>
    <tbody>{breakdown.map((b:any)=><tr key={b.category}><td><b>{b.category}</b></td><td>{rupiah(b.amount)}</td><td>{bebanTotal?Math.round(b.amount/bebanTotal*100):0}%</td></tr>)}</tbody>
    {breakdown.length>0&&<tfoot><tr><th>Total beban</th><th>{rupiah(bebanTotal)}</th><th>100%</th></tr></tfoot>}
    </table>
    <Empty show={!breakdown.length} text="Belum ada beban operasional pada rentang ini."/>
   </div>
  </div>
 </>
}
