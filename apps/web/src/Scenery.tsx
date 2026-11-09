// Our own night-mountain scene: snow, layered peaks, pines and gondolas on a sagging cable. Decorative only.
// The cable is y = 140 + 184t - 196t² at x = 1440t; the `glide` keyframes in styles.css follow the same curve.
const at = (t: number) => `translate(${1440 * t}px, ${140 + 184 * t - 196 * t * t}px)`
const gondolas: [string, number][] = [['#FBEB8C', 0.1], ['#93EAFF', 0.44], ['#F7A8D8', 0.82]]
const snow = Array.from({ length: 36 }, (_, i) => [(i * 131 + 40) % 1440, (i * 53) % 150, 1.4 + (i % 3) * 0.7])
const pines = [[52, 56], [96, 38], [188, 46], [470, 40], [578, 50], [694, 38], [1010, 44], [1178, 54], [1226, 36], [1334, 42], [1400, 52]]
const peaks: [string, string, string][] = [
  ['M-40 230 130 86 300 230Z', 'M130 86 176 126 146 120 124 144 96 116Z', '#5B2D8E'],
  ['M200 230 430 60 660 230Z', 'M430 60 492 108 452 100 424 132 380 98Z', '#6A37A3'],
  ['M560 230 760 110 960 230Z', 'M760 110 806 140 772 134 752 154 720 136Z', '#4B2478'],
  ['M840 230 1080 52 1320 230Z', 'M1080 52 1144 102 1100 94 1072 128 1028 92Z', '#6A37A3'],
  ['M1220 230 1390 100 1560 230Z', 'M1390 100 1436 136 1404 130 1384 152 1352 130Z', '#5B2D8E'],
]

export const Scenery = ({ className = '' }: { className?: string }) => (
  <svg className={`scenery ${className}`} viewBox="0 0 1440 230" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <g fill="#fff" opacity=".55">{snow.map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} />)}</g>
    <path d="M-60 230 80 132 200 196 320 118 470 204 610 140 760 214 910 126 1050 200 1190 122 1320 196 1450 134 1500 230Z" fill="#33277A" />
    {peaks.map(([body, cap, fill]) => <g key={body}><path d={body} fill={fill} /><path d={cap} fill="#C7D6F5" /></g>)}
    <path d="M0 140Q720 232 1440 128" fill="none" stroke="#C7D6F5" strokeWidth="2" />
    {gondolas.map(([fill, t]) => (
      <g key={fill} className="gondola" style={{ transform: at(t), animationDelay: `${-t * 90}s` }}>
        <path d="M0 0v14" stroke="#C7D6F5" strokeWidth="2" /><rect x="-18" y="14" width="36" height="28" rx="5" fill={fill} /><rect x="-11" y="20" width="22" height="12" rx="1" fill="#113E82" />
      </g>
    ))}
    <path d="M0 230v-16q360-34 720-12t720-10v38Z" fill="#8FA8E0" /><path d="M0 230v-6q360-22 720-6t720-8v20Z" fill="#B9CBF2" />
    {pines.map(([x, h], i) => <path key={x} fill={i % 2 ? '#17625E' : '#1F8A84'} d={`M${x - h * 0.36} 228 ${x} ${228 - h} ${x + h * 0.36} 228ZM${x - h * 0.26} ${228 - h * 0.45} ${x} ${228 - h * 1.15} ${x + h * 0.26} ${228 - h * 0.45}Z`} />)}
  </svg>
)
