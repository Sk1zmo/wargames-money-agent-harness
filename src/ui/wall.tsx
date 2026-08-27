import Link from "next/link";

/**
 * The wall.
 *
 * ---------------------------------------------------------------------------
 * POSITION IS IDENTITY
 * ---------------------------------------------------------------------------
 * Every attack class gets a tile, and every tile is always present in the same
 * position — including the ones that have never been run. An operator learns
 * where prompt injection sits and afterwards finds it without reading.
 *
 * That is why this is a fixed grid over the full class list rather than a list
 * of results. A wall that only shows what has been tested cannot show you what
 * has NOT been, and "we never ran that class" is the finding most likely to
 * matter in a certification harness.
 */

export interface Tile {
  key: string;
  name: string;
  verdict: "PASS" | "FAIL" | "CONDITIONAL" | "REVIEW" | "IDLE";
  value: string;
  detail: string;
  href?: string;
}

const CLASS: Record<Tile["verdict"], string> = {
  PASS: "tile-pass",
  FAIL: "tile-fail",
  CONDITIONAL: "tile-conditional",
  REVIEW: "tile-review",
  IDLE: "tile-idle",
};

const VALUE_COLOUR: Record<Tile["verdict"], string> = {
  PASS: "text-[var(--color-verdict-pass)]",
  FAIL: "text-[var(--color-verdict-fail)]",
  CONDITIONAL: "text-[var(--color-verdict-conditional)]",
  REVIEW: "text-[var(--color-verdict-review)]",
  IDLE: "text-[var(--color-phosphor-faint)]",
};

export function Wall({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="wall">
      {tiles.map((tile) => {
        const inner = (
          <>
            <p className="tile-key">{tile.key}</p>
            <p className={`tile-value ${VALUE_COLOUR[tile.verdict]}`}>{tile.value}</p>
            <p className="tile-name">{tile.name}</p>
            <p className="mt-auto text-[0.625rem] leading-snug text-[var(--color-phosphor-faint)]">
              {tile.detail}
            </p>
          </>
        );

        return tile.href ? (
          <Link key={tile.key} href={tile.href} className={`tile ${CLASS[tile.verdict]}`}>
            {inner}
          </Link>
        ) : (
          <div key={tile.key} className={`tile ${CLASS[tile.verdict]}`}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
