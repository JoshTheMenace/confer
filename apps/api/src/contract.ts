// The one contract between the API and the web app. Types only: no runtime code.
// The API's handlers return `satisfies Api[...]['res']`; the web client is typed by the same map,
// so a change here breaks both builds instead of production.

export const contactFields = ['email', 'linkedin', 'github'] as const
export type ContactField = (typeof contactFields)[number]
export type Contact = Partial<Record<ContactField, string>>
export type Kind = 'attendee' | 'sponsor' | 'organizer'
export type Approach = 'open' | 'ask' | 'quiet'
/** off: I decide each time. starred: booths I starred get my card automatically. matching: so do booths with 2+ things in common. */
export type AutoShare = 'off' | 'starred' | 'matching'
export type Attachment = { url: string; label: string }
export type Term = { term: string; count: number }

/** One thing two profiles have in common. `related` pairs are semantically close tags found with Elastic embeddings. */
export type Common = { kind: 'same' | 'related'; mine: string; theirs: string }

/** What a person or booth sets up once. Stored in `profiles`; contact and photo live apart, in `vault`. */
export type ProfileInput = {
  displayName: string // first name or nickname; a booth's name
  pronouns?: string
  approach: Approach
  commPref?: string
  role?: string
  interests: string[] // attendees: 3 to 8 topic tags; booths: the topics their products cover
  lookingFor: string[]
  about?: string
  stuckOn?: string // one line on what you're stuck on; only matching booths you allowed can see it
  discoverable: boolean // other attendees may find me by my topic tags (never by role, about or stuckOn)
  openToBooths: boolean // matching booths may see my silhouette and send me a request
  boothsSeeName: boolean
  autoShare: AutoShare
  shareFields: ContactField[] // what Share hands over unless I pick differently
  pitch?: string // booths: the default note on a connection request
  attachment?: Attachment // booths: what every request carries
}
export type Profile = ProfileInput & { id: string; tagId: number; kind: Kind; starred: string[]; hasPhoto: boolean }
/** Only ever returned to the owner. `photo` is a small data URL. */
export type Me = Profile & { contact: Contact; photo?: string }

/**
 * What one viewer may know about one subject. A silhouette until the subject shares.
 * Full `interests` are never sent to another attendee: peers get `common` only.
 */
export type Card = {
  id: string
  tagId: number
  kind: Kind
  name: string | null // null: hidden from this viewer (a booth looking at an attendee who keeps their name private)
  pronouns?: string
  approach: Approach
  commPref?: string
  common: Common[] // frozen at the first scan, so editing your interests can't be used to probe someone else's
  met?: { at: string; by: 'me' | 'them' | 'both' }
  theyShared?: { at: string; fields: ContactField[]; contact: Contact; photo?: string; role?: string } // what the subject gave me
  iShared?: { at: string; fields: ContactField[] } // what I gave the subject
  // Booths are public; an attendee's topics reach a booth, never a peer.
  role?: string
  interests?: string[]
  about?: string
  stuckOn?: string
  pitch?: string
  attachment?: Attachment
  thread?: { status: Thread['status']; startedBy: 'me' | 'them'; unread: number } // my conversation with them, if any
  starred?: boolean // viewer starred this booth
  muted?: boolean // viewer muted this booth
}

export type BoothRequest = {
  id: string
  booth: Card
  note: string
  attachment?: Attachment // delivered whether or not you share
  why: Common[] // what you have in common with the booth's topics
  status: 'pending' | 'shared' | 'ignored'
  source: 'scan' | 'match' // they scanned you, or search matched you (only if openToBooths)
  createdAt: string
  expiresAt: string
}

/**
 * A conversation between two profiles, and the center of the app. It starts as a MESSAGE REQUEST:
 * the first message says why someone wants to connect, and the recipient decides whether to look, answer, ignore or mute.
 * Chatting never reveals more than the card does: sharing your contact card stays a separate, deliberate tap.
 */
export type Thread = {
  id: string // the other profile's id: the :id in /api/chats/:id
  with: Card // through the same lens as everywhere else: a peer is a silhouette until they share, a booth is public
  status: 'request' | 'open' | 'ignored' // request: waiting for the recipient. open: both can write.
  startedBy: 'me' | 'them'
  why: Common[] // what the two have in common, frozen when the request was sent
  source: 'scan' | 'match' // they met, or search matched them (discoverable people; openToBooths for booths)
  attachment?: Attachment // a booth's first message can carry one: yours whether or not you answer
  last: { text: string; at: string; from: 'me' | 'them' }
  unread: number
  createdAt: string
  expiresAt?: string // an unanswered request is deleted after the event
}
export type Message = { id: string; from: 'me' | 'them'; text: string; at: string }

/** shared: you gave your card. opened: they looked at it. unshared: the deletion receipt. */
export type Receipt = { id: string; type: 'shared' | 'opened' | 'unshared'; who: Card | null; fields: ContactField[]; at: string; traceId?: string }

/** A booth's view of one attendee: anonymous until they share. `fit` is 0 to 100. */
export type Visitor = { card: Card; fit: number; source: 'scan' | 'match'; scannedAt?: string; request?: { status: BoothRequest['status']; note: string; sentAt: string } }
export type Lead = { card: Card; sharedAt: string; via: 'manual' | 'auto' | 'request'; note?: string } // note: the request that won them over
export type BoothStats = {
  scans: number; requests: number; pending: number; shared: number; ignored: number
  shareRate: number // shared / requests, 0 to 1
  contentDelivered: number // people who received the attachment
  topInterests: Term[] // anonymous totals
  notes: { note: string; sent: number; shared: number; rate: number }[] // which pitch earns shares
}

export type Talk = { id: string; title: string; speaker: string; abstract: string; track: string; room: string; startsAt: string; endsAt: string; topics: string[] }
export type Discover = {
  query: string // what was searched: your own text, or your interests and "stuck on" line
  people: { card: Card; fit: number; common: Common[] }[]
  booths: { card: Card; fit: number; why: string[] }[]
  talks: { talk: Talk; fit: number; why: string[] }[]
}

export type Pulse = {
  at: string
  totals: { attendees: number; booths: number; meetings: number; shares: number; unshares: number; requests: number; shareRate: number }
  series: { t: string; scans: number; shares: number }[] // per minute, last 30 minutes
  topInterests: Term[]
  booths?: { id: string; name: string; scans: number; requests: number; shared: number; shareRate: number; mutes: number }[] // organizers only
  health: {
    source: 'dash0' | 'unavailable' // read live from Dash0 with PromQL
    p95Ms?: number; errorRate?: number; requestsPerMin?: number
    slo?: { name: string; target: number; current: number; ok: boolean }
    dashboardUrl?: string
  }
}

/** Every route: `'METHOD /path'` → request body, query, and response. `:id` is a profile id unless noted. */
export type Api = {
  'POST /api/me/signup': { body: ProfileInput & { contact: Contact; photo?: string; code?: string /* sponsor or organizer code */ }; res: { token: string; me: Me } }
  'GET /api/me': { res: { me: Me } }
  'PATCH /api/me': { body: Partial<ProfileInput> & { contact?: Contact; photo?: string /* '' removes it */ }; res: { me: Me } }

  'POST /api/scan': { body: { tagIds: number[]; source: 'camera' | 'manual' }; res: { cards: Card[] } }
  'GET /api/people': { res: { people: Card[] } } // everyone I met, either direction, newest first: also the "who scanned me" log
  'POST /api/people/:id/share': { body: { fields?: ContactField[] }; res: { card: Card } }
  'DELETE /api/people/:id/share': { res: { card: Card; receipt: Receipt } }
  'POST /api/people/share': { body: { ids: string[] }; res: { shared: number } } // end-of-event bulk share

  'GET /api/inbox': { res: { requests: BoothRequest[]; receipts: Receipt[] } }
  'POST /api/inbox/:id': { body: { action: 'share' | 'ignore' | 'mute'; fields?: ContactField[] }; res: { request: BoothRequest } } // :id is a request id

  // Connection requests and chat (replaces the booth-only inbox above once the API moves over).
  // requests: message requests waiting for my answer. chats: open conversations and requests I sent, newest first.
  'GET /api/chats': { res: { requests: Thread[]; chats: Thread[] } }
  'GET /api/chats/:id': { res: { thread: Thread; messages: Message[] } } // reading marks it read
  // No conversation yet: this is a message request and `text` is the reason. Replying to a request accepts it.
  'POST /api/chats/:id': { body: { text: string; attachment?: Attachment }; res: { thread: Thread; message: Message } }
  // accept: open the chat. share: accept and share my card. ignore: hide it. mute: no more messages from this sender.
  'POST /api/chats/:id/answer': { body: { action: 'accept' | 'share' | 'ignore' | 'mute'; fields?: ContactField[] }; res: { thread: Thread } }

  'GET /api/booth': { res: { leads: Lead[]; visitors: Visitor[]; stats: BoothStats } }
  'POST /api/booth/requests': { body: { to: string[]; note: string; attachment?: Attachment }; res: { sent: number; autoShared: number } }
  'GET /api/booth/prospects': { res: { prospects: Visitor[] } }

  'GET /api/discover': { query: { q?: string }; res: Discover }
  'PUT /api/booths/:id/star': { res: { starred: boolean } }
  'DELETE /api/booths/:id/star': { res: { starred: boolean } }

  'GET /api/pulse': { res: Pulse }
  'GET /api/config': { res: { dash0: { url: string; token: string }; event: { name: string; endsAt: string } } }
}
