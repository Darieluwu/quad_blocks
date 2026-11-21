import { CHARACTERS, type CharacterId, type VoiceEvent } from './catalog'

const art = import.meta.glob('./art/**/*.{webp,png,avif}',{eager:true,import:'default',query:'?url'}) as Record<string,string>
const voices = import.meta.glob('./voices/ja/**/*.{ogg,mp3,wav}',{eager:true,import:'default',query:'?url&no-inline'}) as Record<string,string>
const subtitles = import.meta.glob('./subtitles/{es,en}.json',{eager:true,import:'default'}) as Record<string,unknown>
type Language = 'es'|'en'

export function findAsset(files:Record<string,string>,key:string,extensions:readonly string[]) {
  for (const extension of extensions) {
    const url = files[`${key}.${extension}`]
    if (url) return url
  }
}
export const artwork = (key:string) => findAsset(art,`./art/${key}`,['webp','png','avif'])
export const japaneseVoice = (id:CharacterId,event:VoiceEvent) => findAsset(voices,`./voices/ja/${CHARACTERS[id].assets.voicesJa[event]}`,['ogg','mp3','wav'])

type SubtitleBank = Partial<Record<CharacterId,Partial<Record<VoiceEvent,string>>>>
export function subtitleFor(id:CharacterId,event:VoiceEvent,language:Language = 'es') {
  const languages: Language[] = language==='es' ? ['es'] : [language,'es']
  for (const lang of languages) {
    const text = (subtitles[`./subtitles/${lang}.json`] as SubtitleBank|undefined)?.[id]?.[event]
    if (typeof text==='string' && text.trim()) return text
  }
}
