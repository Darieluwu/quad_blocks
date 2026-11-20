import { expect, it } from 'vitest'
import { DEFAULT_BLITZ, BlitzMatch } from '../src/engine/blitz'
import { teamForSlot } from '../src/engine/match'
import { DEFAULT_RULES, HZ } from '../src/engine/rules'

it('cuatro IA completan una partida con relevos, Zone, caídas, rescates y victoria',()=>{
  const roster = [3,6,4,6].map((level,slot)=>({slot,team:teamForSlot(slot),level}))
  const rules = {...DEFAULT_RULES,zoneSeconds:5,gravity:3,progression:.05,garbageDelay:400,garbageCap:5}
  const match = new BlitzMatch(rules,'blitz-copa-1',roster,{...DEFAULT_BLITZ,turn:10,countdown:2})
  const events = new Map<string,number>()
  for (let i=0;i<HZ*450 && !match.finished;i++) {
    match.tick()
    for (const player of match.players) {
      for (const event of player.events) events.set(event.type,(events.get(event.type) ?? 0)+1)
      player.events.length = 0
    }
  }
  for (const name of ['blitzRotate','send','zoneStart','blitzDown','blitzEmergency','blitzRevived','blitzVictory']) {
    expect(events.get(name) ?? 0,name).toBeGreaterThan(0)
  }
  expect(events.get('blitzRevived')).toBe(3)
  expect(match.finished).toBe(true)
  expect(match.winningTeam).toBe(1)
},15000)
