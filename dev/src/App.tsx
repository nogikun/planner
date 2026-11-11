import { useEffect, useRef, useState } from 'react'
import * as C from './core'
import type { ActivityPatch, DayPlan, DayStatus, Store, TimeInput } from './core'
import DayView from './DayView'
import MonthView, { MiniCalendar } from './MonthView'

const KEY = 'planner.v1'
const todayStr = () => new Date().toLocaleDateString('sv-SE')

function load(): Store {
  const raw = localStorage.getItem(KEY)
  try {
    const s = raw && JSON.parse(raw)
    if (s && typeof s.days === 'object') return { ...s, colors: C.assignColors(s) }
  } catch {
    // 壊れたデータを空データで上書きしないよう退避しておく
    localStorage.setItem(`${KEY}.broken-${Date.now()}`, raw!)
  }
  return { days: {} }
}

// AI やブラウザ自動操作から使う、時刻を HH:MM にした読み取り用の形
const describe = (d: DayPlan) => ({
  ...d,
  rangeStart: C.fmt(d.rangeStart),
  rangeEnd: C.fmt(d.rangeEnd),
  activities: d.activities.map((a) => ({
    ...a,
    planStart: C.fmt(a.planStart),
    planEnd: C.fmt(a.planEnd),
    actualStart: C.fmt(a.actualStart) || null,
    actualEnd: C.fmt(a.actualEnd) || null,
    ...C.metrics(a),
  })),
})

export type Mutator = (d: DayPlan, s: Store) => unknown

declare global {
  interface Window {
    planner: unknown
  }
}

export default function App() {
  const [store, setStore] = useState(load)
  const storeRef = useRef(store)
  const [view, setView] = useState<'month' | 'day'>('month')
  const [date, setDate] = useState(todayStr)
  const [month, setMonth] = useState(() => todayStr().slice(0, 7))

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(store))
    } catch (e) {
      alert(`保存に失敗しました。JSONバックアップを取ってください: ${(e as Error).message}`)
    }
  }, [store])

  const commit = (next: Store) => {
    storeRef.current = { ...next, colors: C.assignColors(next) }
    setStore(storeRef.current)
  }
  // 繰り返し予定を含めた day のコピーに fn を適用して保存する（この日の繰り返し予定はこの時点で確定する）。
  // fn には繰り返しルールを変更できる store のコピーも渡す。fn が投げた例外はそのまま呼び出し側へ。
  const apply = (date: string, fn: Mutator) => {
    const s: Store = { ...storeRef.current, rules: structuredClone(storeRef.current.rules ?? []) }
    const d = C.materialize(s, date)
    fn(d, s)
    commit({ ...s, days: { ...s.days, [date]: d } })
    return C.materialize(storeRef.current, date)
  }
  // UI 用: エラーはダイアログで知らせて null を返す
  const mutate = (date: string, fn: Mutator) => {
    try {
      return apply(date, fn)
    } catch (e) {
      alert((e as Error).message)
      return null
    }
  }

  useEffect(() => {
    window.planner = {
      getDay: (date: string) => describe(C.materialize(storeRef.current, date)),
      // from と to を両方渡すと、繰り返し予定だけの日も含める
      listDays: (from?: string, to?: string) => C.daysIn(storeRef.current, from, to).map(describe),
      listRules: () => (storeRef.current.rules ?? []).map((r) => ({ ...r, start: C.fmt(r.start), end: C.fmt(r.end) })),
      // weekdays: 0=日 … 6=土。空配列で繰り返しを終了
      setRecurrence: (date: string, id: string, weekdays: number[]) =>
        describe(apply(date, (d, s) => C.setRecurrence(s, d, id, weekdays))),
      addActivity: (date: string, a: { title?: string; memo?: string; start?: TimeInput; end: TimeInput }) =>
        describe(apply(date, (d) => C.addActivity(d, a))),
      updateActivity: (date: string, id: string, patch: ActivityPatch) => describe(apply(date, (d) => C.updateActivity(d, id, patch))),
      removeActivity: (date: string, id: string) => describe(apply(date, (d) => C.removeActivity(d, id))),
      shiftFollowing: (date: string, id: string, minutes: number) => describe(apply(date, (d) => C.shiftFollowing(d, id, minutes))),
      setRange: (date: string, start: TimeInput, end: TimeInput) =>
        describe(apply(date, (d) => {
          d.rangeStart = C.toMin(start) ?? d.rangeStart
          d.rangeEnd = C.toMin(end) ?? d.rangeEnd
          if (d.rangeEnd <= d.rangeStart) throw new Error('表示終了は開始より後にしてください')
        })),
      setStatus: (date: string, status: DayStatus) => describe(apply(date, (d) => (d.status = status))),
      exportCSV: (from?: string, to?: string) => C.toCSV(storeRef.current, from, to),
    }
  }, [])

  const today = todayStr()
  const pick = (d: string) => {
    setDate(d)
    setMonth(d.slice(0, 7))
  }
  const openDay = (d: string) => {
    pick(d)
    setView('day')
  }
  const go = (n: number) => (view === 'month' ? setMonth(C.addMonths(month, n)) : pick(C.addDays(date, n)))
  const [y, m] = month.split('-').map(Number)
  const title = view === 'month' ? `${y}年 ${m}月`
    : new Date(`${date}T00:00Z`).toLocaleDateString('ja-JP', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="brand-icon" aria-hidden>◷</span>日次プランナー</div>
        <button className="outlined" onClick={() => (view === 'month' ? setMonth(today.slice(0, 7)) : pick(today))}>今日</button>
        <button className="icon" aria-label={view === 'month' ? '前月' : '前日'} onClick={() => go(-1)}>‹</button>
        <button className="icon" aria-label={view === 'month' ? '翌月' : '翌日'} onClick={() => go(1)}>›</button>
        <h1>{title}</h1>
        <span className="spacer" />
        <div className="viewswitch" role="tablist" aria-label="表示">
          {(['day', 'month'] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => (v === 'day' ? openDay(date) : setView('month'))}>
              {v === 'day' ? '日' : '月'}
            </button>
          ))}
        </div>
      </header>
      <aside className="sidebar">
        <button className="create" onClick={() => openDay(date)}><span aria-hidden>＋</span>作成</button>
        <MiniCalendar month={month} selected={date} today={today} onPick={openDay} onMonth={setMonth} />
      </aside>
      <main>{view === 'month' ? (
    <MonthView
      store={store}
      month={month}
      today={today}
      onOpen={openDay}
      onImport={(data) => {
        const cur = storeRef.current
        const ids = new Set((data.rules ?? []).map((r) => r.id))
        commit({
          days: { ...cur.days, ...data.days },
          colors: { ...data.colors, ...cur.colors },
          rules: [...(cur.rules ?? []).filter((r) => !ids.has(r.id)), ...(data.rules ?? [])],
        })
      }}
    />
  ) : (
    <DayView
      key={date}
      day={C.materialize(store, date)}
      colors={store.colors}
      rules={store.rules ?? []}
      mutate={(fn) => mutate(date, fn)}
    />
  )}</main>
    </div>
  )
}
