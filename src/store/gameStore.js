import { create } from 'zustand'
import story from '../data/story.json'

export const useGameStore = create((set, get) => ({
  phase: 'START',
  storyId: 'prologue_01',
  stats: { heart: 5, fish: 6, stamps: 3, trust: 0 },
  ownedFurniture: [],
  selectedChoice: null,
  diceResult: null,
  chapter: '序章 · 金枪鱼事件',
  getNode: () => story.find((item) => item.id === get().storyId),
  startGame: () => set({ phase: 'STORY' }),
  buyFurniture: (item) => {
    const { stats, ownedFurniture } = get()
    if (ownedFurniture.includes(item.id) || stats.stamps < item.price) return false
    set({ stats: { ...stats, stamps: stats.stamps - item.price }, ownedFurniture: [...ownedFurniture, item.id] })
    return true
  },
  advance: () => {
    const node = get().getNode()
    if (!node) return
    if (node.type === 'choice') set({ phase: 'ROLL_DICE' })
    else if (node.type === 'tower_defense') set({ phase: 'TOWER_DEFENSE', chapter: '第一章 · 陌生小巷' })
    else if (node.type === 'end') set({ phase: 'END', chapter: '第一章 · 完成' })
    else if (node.next_id) set({ storyId: node.next_id })
  },
  choose: (id) => set({ selectedChoice: id, diceResult: null }),
  resolveDice: (raw, modifier, successReward, failureCost) => {
    const success = raw + modifier >= 4
    const stats = { ...get().stats }
    if (success) {
      stats.fish += successReward.fish || 0
      stats.trust += successReward.trust || 0
    } else {
      stats.heart = Math.max(1, stats.heart - (failureCost.heart || 0))
    }
    set({ stats, diceResult: { raw, total: raw + modifier, success } })
  },
  finishDice: () => {
    const success = get().diceResult?.success
    set({ phase: 'STORY', storyId: success ? 'dice_success' : 'dice_fail' })
  },
  finishDefense: () => set((s) => ({
    phase: 'STORY', storyId: 'poster_01', stats: { ...s.stats, stamps: s.stats.stamps + 2 }, chapter: '第一章 · 雨中的线索'
  })),
  restart: () => set({
    phase: 'START', storyId: 'prologue_01', stats: { heart: 5, fish: 6, stamps: 3, trust: 0 }, ownedFurniture: [], selectedChoice: null, diceResult: null, chapter: '序章 · 金枪鱼事件'
  })
}))
