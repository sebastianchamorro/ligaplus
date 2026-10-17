type EventType = 'goal'|'yellow'|'red'|'substitution'
export type MatchEvent = { id:string; minute:number; type:EventType; team:string; player?:string; playerIn?:string; playerOut?:string }
export type Match = { id:string; date:string; home:string; away:string; homeScore:number; awayScore:number; status:'scheduled'|'live'|'finished'; events:MatchEvent[] }
const seedMatches:Match[] = [{id:'mad-pue-7',date:'2026-10-11 16:30',home:'Madariaga',away:'Puente Seco',homeScore:2,awayScore:1,status:'finished',events:[{id:'e1',minute:78,type:'goal',team:'Madariaga',player:'Martín Sosa'},{id:'e2',minute:66,type:'yellow',team:'Puente Seco',player:'Lucas Benítez'},{id:'e3',minute:54,type:'substitution',team:'Madariaga',playerIn:'Martín Sosa',playerOut:'Rodrigo Acosta'},{id:'e4',minute:31,type:'goal',team:'Madariaga',player:'Tomás Gómez'},{id:'e5',minute:18,type:'goal',team:'Puente Seco',player:'Diego Ramírez'}]}]
export function useLeague(){
  const matches=useState<Match[]>('league-matches',()=>seedMatches)
  const addEvent=(matchId:string,event:Omit<MatchEvent,'id'>)=>{const m=matches.value.find(x=>x.id===matchId);if(!m)return;m.events.unshift({...event,id:crypto.randomUUID()});if(event.type==='goal'){if(event.team===m.home)m.homeScore++;if(event.team===m.away)m.awayScore++}}
  const addMatch=(match:Omit<Match,'id'|'events'>)=>matches.value.push({...match,id:crypto.randomUUID(),events:[]})
  return {matches,addEvent,addMatch}
}
