import { TagSvg } from './TagSvg'

const css = `
.badge-sheet { display: flex; flex-wrap: wrap; gap: 1cm; justify-content: center; padding: 1cm; background: #fff; color: #000 }
.badge-sheet figure { margin: 0; width: 6cm; text-align: center; break-inside: avoid }
.badge-sheet svg { display: block; width: 6cm; height: 6cm }
.badge-sheet figcaption { font: 600 16pt system-ui, sans-serif; margin-top: 2mm; color: #000 }
@media print {
  @page { margin: 1cm }
  body * { visibility: hidden }
  .badge-sheet, .badge-sheet * { visibility: visible }
  .badge-sheet { position: absolute; top: 0; left: 0; padding: 0 }
}`

/** Printable sheet of badges, ~6cm each, so organizers can print and cut. */
export function BadgeSheet({ ids }: { ids: number[] }) {
  return (
    <section className="badge-sheet">
      <style>{css}</style>
      {ids.map((id) => (
        <figure key={id}>
          <TagSvg id={id} />
          <figcaption>{id}</figcaption>
        </figure>
      ))}
    </section>
  )
}
