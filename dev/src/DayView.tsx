import { useRef, useState } from 'react'
import Clock, { type Arc } from './Clock'
import * as C from './core'
import type { Activity, Colors, DayPlan, Rule, Status } from './core'
import type { Mutator } from './App'

interface Props {
  day: DayPlan
  colors?: Colors
  rules: Rule[]
  mutate: (fn: Mutator) => DayPlan | null
}

const STATUS_LABEL: Record<Status, string> = { '': '未入力', done: '完了', partial: '一部', skipped: '未実施' }
const DAY_STATUS = { draft: '下書き', planned: '計画確定', reviewed: '振り返り済' }

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

// 予定作成の初期値: 開始=直前の終了、終了=開始+60分
const planDraft = (d: DayPlan) => {
  const start = Math.min(C.nextStart(d), C.DAY_END - C.STEP)
  return { start, end: Math.min(start + 60, C.DAY_END) }
}
const actualDraft = (a: Activity) => ({ start: a.actualStart ?? a.planStart, end: a.actualEnd ?? a.planEnd })

export default function DayView({ day, colors, rules, mutate }: Props) {
  const [mode, setMode] = useState<'plan' | 'review'>('plan')
  const [draft, setDraft] = useState(() => planDraft(day))
  const [which, setWhich] = useState<'start' | 'end'>('end')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reviewStatus, setReviewStatus] = useState<Status>('done')
  const [editing, setEditing] = useState<Activity | 'new' | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  const selected = day.activities.find((a) => a.id === selectedId) ?? null

  const select = (a: Activity | undefined) => {
    setSelectedId(a?.id ?? null)
    if (a) {
      setDraft(actualDraft(a))
      setReviewStatus(a.status || 'done')
    }
  }

  const switchMode = (m: 'plan' | 'review') => {
    setMode(m)
    if (m === 'plan') setDraft(planDraft(day))
    else select(day.activities.find((a) => a.actualEnd == null) ?? day.activities[0])
  }

  const openDialog = (target: Activity | 'new') => {
    setEditing(target)
    dialog.current!.showModal()
  }

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const f = Object.fromEntries(form) as Record<string, string>
    const weekdays = form.getAll('wd').map(Number)
    const next = mutate((d, s) => {
      const a = editing === 'new'
        ? C.addActivity(d, { title: f.title, memo: f.memo, start: f.start, end: f.end })
        : C.updateActivity(d, (editing as Activity).id, { title: f.title, memo: f.memo, planStart: f.start, planEnd: f.end })
      C.setRecurrence(s, d, a.id, weekdays)
    })
    if (!next) return
    dialog.current!.close()
    if (editing === 'new') setDraft(planDraft(next))
  }

  // series: 繰り返しルールごと削除（確定済みの過去の日の予定は残る）
  const onDelete = (series: boolean) => {
    if (editing === 'new' || !editing) return
    const msg = series ? `「${editing.title}」の繰り返しをすべて削除しますか？` : editing.ruleId
      ? `この日の「${editing.title}」だけを削除しますか？` : `「${editing.title}」を削除しますか？`
    if (!confirm(msg)) return
    mutate((d, s) => {
      if (series) C.setRecurrence(s, d, editing.id, [])
      C.removeActivity(d, editing.id)
    })
    dialog.current!.close()
  }
  const editingRule = editing && editing !== 'new' ? rules.find((r) => r.id === editing.ruleId) : undefined

  // 実績を保存し、終了がずれた分だけ後続をずらすか確認する (FR-18: ユーザー承認方式)
  const saveActual = () => {
    if (!selected) return
    const delta = draft.end - (selected.actualEnd ?? selected.planEnd)
    const following = day.activities.length - 1 - selected.order
    const shift = delta !== 0 && following > 0 && confirm(`後続の${following}件の実績を${C.fmtDiff(delta)}ずらしますか？`)
    const next = mutate((d) => {
      C.updateActivity(d, selected.id, { actualStart: draft.start, actualEnd: draft.end, status: reviewStatus })
      if (shift) C.shiftFollowing(d, selected.id, delta)
    })
    if (next) select(next.activities[selected.order + 1])
  }

  const setRange = (key: 'rangeStart' | 'rangeEnd', v: string) => {
    const m = C.toMin(v)
    if (m == null) return
    const next = mutate((d) => {
      d[key] = m
      if (d.rangeEnd <= d.rangeStart) throw new Error('表示終了は開始より後にしてください')
    })
    if (next && mode === 'plan') setDraft(planDraft(next))
  }

  const arcs: Arc[] = day.activities.flatMap((a) => {
    const color = C.colorOf(a.title, colors)
    const list: Arc[] = [{ start: a.planStart, end: a.planEnd, color }]
    if (mode === 'review' && a.actualStart != null && a.actualEnd != null && a.id !== selectedId)
      list.push({ start: a.actualStart, end: a.actualEnd, color, inner: true })
    return list
  })

  const total = (pick: (m: ReturnType<typeof C.metrics>) => number | null) =>
    day.activities.reduce((s, a) => s + (pick(C.metrics(a)) ?? 0), 0)

  return (
    <section className="day">
      <header className="bar">
        <label>
          時間帯 <input type="time" step={900} value={C.fmt(day.rangeStart)} onChange={(e) => setRange('rangeStart', e.target.value)} />
        </label>
        〜
        <input type="time" step={900} value={C.fmt(day.rangeEnd)} onChange={(e) => setRange('rangeEnd', e.target.value)} aria-label="時間帯の終了" />
        <span className={`badge ${day.status}`}>{DAY_STATUS[day.status]}</span>
        <div className="tabs" role="tablist">
          {(['plan', 'review'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => switchMode(m)}>
              {m === 'plan' ? '計画' : '振り返り'}
            </button>
          ))}
        </div>
      </header>

      <div className="daybody">
        <div className="panel clockpanel">
          <p className="hint">
            {mode === 'plan' ? '新しい予定' : selected ? `実績: ${selected.title}` : '活動を選択してください'}
          </p>
          <Clock
            rangeStart={day.rangeStart}
            rangeEnd={day.rangeEnd}
            start={draft.start}
            end={draft.end}
            which={which}
            arcs={arcs}
            inner={mode === 'review'}
            onChange={(start, end) => setDraft({ start, end })}
          />
          <div className="segmented" role="radiogroup" aria-label="ホイールで調整する時刻">
            {(['start', 'end'] as const).map((w) => (
              <label key={w}>
                <input type="radio" name="which" checked={which === w} onChange={() => setWhich(w)} />
                <span>{w === 'start' ? '開始' : '終了'}を調整</span>
              </label>
            ))}
          </div>
          <p className="hint">ホイール/↑↓: 15分ずつ ・ Shift併用で開始 ・ クリックで移動</p>
          {mode === 'plan' ? (
            <div className="row">
              <button className="primary" disabled={draft.end <= draft.start} onClick={() => openDialog('new')}>予定作成</button>
              <button onClick={() => mutate((d) => (d.status = 'planned'))} disabled={!day.activities.length}>計画確定</button>
            </div>
          ) : (
            <div className="row">
              <select value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value as Status)} aria-label="実施状況">
                {(['done', 'partial', 'skipped'] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
              <button className="primary" disabled={!selected} onClick={saveActual}>実績を保存</button>
              <button onClick={() => mutate((d) => (d.status = 'reviewed'))} disabled={!day.activities.length}>振り返り完了</button>
            </div>
          )}
        </div>

        <div className="panel">
          {day.activities.length === 0 ? (
            <p className="empty">予定がありません。時計をホイールで調整して「予定作成」を押してください。</p>
          ) : mode === 'plan' ? (
            <table>
              <thead><tr><th></th><th>時間</th><th>タイトル</th><th>メモ</th><th>分</th></tr></thead>
              <tbody>
                {day.activities.map((a) => (
                  <tr key={a.id} onClick={() => openDialog(a)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openDialog(a)}>
                    <td><i className="swatch" style={{ background: C.colorOf(a.title, colors) }} /></td>
                    <td>{C.fmt12(a.planStart)} – {C.fmt12(a.planEnd)}</td>
                    <td>{a.title}{a.ruleId && <Repeat />}</td>
                    <td className="memo">{a.memo}</td>
                    <td className="num">{a.planEnd - a.planStart}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={4}>合計</td><td className="num">{total((m) => m.planDur)}</td></tr></tfoot>
            </table>
          ) : (
            <table>
              <thead>
                <tr><th></th><th>タイトル</th><th>予定</th><th>実績</th><th>予定分</th><th>実績分</th><th>差分</th><th>開始ずれ</th><th>状況</th></tr>
              </thead>
              <tbody>
                {day.activities.map((a) => {
                  const m = C.metrics(a)
                  return (
                    <tr key={a.id} className={a.id === selectedId ? 'sel' : ''} onClick={() => select(a)} tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && select(a)}>
                      <td><i className="swatch" style={{ background: C.colorOf(a.title, colors) }} /></td>
                      <td>{a.title}{a.ruleId && <Repeat />}</td>
                      <td>{C.fmt12(a.planStart)} – {C.fmt12(a.planEnd)}</td>
                      <td>{a.actualStart != null ? `${C.fmt12(a.actualStart)} – ${C.fmt12(a.actualEnd)}` : '—'}</td>
                      <td className="num">{m.planDur}</td>
                      <td className="num">{m.actualDur ?? '—'}</td>
                      <td className={`num ${m.diff! > 0 ? 'over' : m.diff! < 0 ? 'under' : ''}`}>{C.fmtDiff(m.diff)}</td>
                      <td className="num">{C.fmtDiff(m.startDelay)}</td>
                      <td>{STATUS_LABEL[a.status]}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>合計</td>
                  <td className="num">{total((m) => m.planDur)}</td>
                  <td className="num">{total((m) => m.actualDur)}</td>
                  <td className="num">{C.fmtDiff(total((m) => m.diff))}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      <dialog ref={dialog} onClose={() => setEditing(null)}>
        {editing && (
          <form method="dialog" onSubmit={onSubmit} key={editing === 'new' ? 'new' : editing.id}>
            <h2>{editing === 'new' ? '予定作成' : '予定を編集'}</h2>
            <label>タイトル<input name="title" autoFocus required defaultValue={editing === 'new' ? '' : editing.title} /></label>
            <label>メモ<textarea name="memo" rows={3} defaultValue={editing === 'new' ? '' : editing.memo} /></label>
            <div className="row">
              <label>開始<input name="start" type="time" step={900} required
                defaultValue={C.fmt(editing === 'new' ? draft.start : editing.planStart)} /></label>
              <label>終了<input name="end" type="time" step={900} required
                defaultValue={C.fmt(editing === 'new' ? draft.end : editing.planEnd)} /></label>
            </div>
            <fieldset className="weekdays">
              <legend>毎週繰り返す</legend>
              <div className="segmented multi">
                {WEEKDAYS.map((w, i) => (
                  <label key={w}>
                    <input type="checkbox" name="wd" value={i} defaultChecked={editingRule?.weekdays.includes(i)} />
                    <span>{w}</span>
                  </label>
                ))}
              </div>
              <small>
                {editingRule ? '時刻やタイトルの変更は、まだ確定していない日の繰り返しにも反映されます。' : 'なにも選ばなければ、この日だけの予定です。'}
              </small>
            </fieldset>
            <div className="row">
              {editing !== 'new' && <button type="button" className="danger" onClick={() => onDelete(false)}>
                {editing.ruleId ? 'この日だけ削除' : '削除'}
              </button>}
              {editingRule && <button type="button" className="danger" onClick={() => onDelete(true)}>繰り返しを削除</button>}
              <span className="spacer" />
              <button type="button" onClick={() => dialog.current!.close()}>キャンセル</button>
              <button className="primary">保存</button>
            </div>
          </form>
        )}
      </dialog>
    </section>
  )
}

const Repeat = () => <span className="repeat" title="毎週繰り返す予定" aria-label="繰り返し">↻</span>
