// 筋肉リストの初期値（機能設計書「4. 筋肉リスト」）
export const MUSCLES = [
  { id: 'chest-pectoralis', name: '大胸筋', group: '胸' },
  { id: 'back-lats', name: '広背筋', group: '背中' },
  { id: 'back-trapezius', name: '僧帽筋', group: '背中' },
  { id: 'back-erector', name: '脊柱起立筋', group: '背中' },
  { id: 'shoulder-front', name: '三角筋前部', group: '肩' },
  { id: 'shoulder-side', name: '三角筋中部', group: '肩' },
  { id: 'shoulder-rear', name: '三角筋後部', group: '肩' },
  { id: 'arm-biceps', name: '上腕二頭筋', group: '腕' },
  { id: 'arm-triceps', name: '上腕三頭筋', group: '腕' },
  { id: 'arm-forearm', name: '前腕', group: '腕' },
  { id: 'core-abs', name: '腹直筋', group: '体幹' },
  { id: 'core-obliques', name: '腹斜筋', group: '体幹' },
  { id: 'leg-glute-max', name: '大殿筋', group: '脚・お尻' },
  { id: 'leg-glute-med', name: '中殿筋', group: '脚・お尻' },
  { id: 'leg-quads', name: '大腿四頭筋', group: '脚・お尻' },
  { id: 'leg-hamstrings', name: 'ハムストリングス', group: '脚・お尻' },
  { id: 'leg-adductors', name: '内転筋', group: '脚・お尻' },
  { id: 'leg-calves', name: 'ふくらはぎ（下腿三頭筋）', group: '脚・お尻' },
].map((m, i) => ({ ...m, builtin: true, order: i }));

// 最初から登録しておく有酸素マシン（機能設計書「有酸素の記録項目」）
export const CARDIO_EXERCISES = [
  { id: 'cardio-treadmill', name: 'トレッドミル', kind: 'treadmill', fixedNote: '' },
  { id: 'cardio-bike', name: 'エアロバイク', kind: 'bike', fixedNote: '' },
  { id: 'cardio-recumbent', name: 'リカンベントバイク', kind: 'bike', fixedNote: '背もたれのあるバイク' },
].map((e) => ({ ...e, muscleIds: [], weightStep: 2.5, hidden: false, createdAt: '2026-10-13T00:00:00+09:00' }));
