import { BACKGROUND_COLOR, THEME_COLOR } from "@/lib/brand";

type AppMarkProps = {
  size: number;
  /** Fracción del lienzo que ocupa la figura. Los iconos maskable usan un valor menor. */
  scale: number;
};

/**
 * Marca propia del portal para los iconos generados con ImageResponse.
 * Es una figura geométrica sin texto, así que no necesita ninguna fuente.
 */
export function AppMark({ size, scale }: AppMarkProps) {
  const mark = size * scale;
  const head = mark * 0.42;
  const bodyWidth = mark * 0.9;
  const bodyHeight = mark * 0.44;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: THEME_COLOR,
      }}
    >
      <div
        style={{
          width: head,
          height: head,
          borderRadius: head / 2,
          background: BACKGROUND_COLOR,
        }}
      />
      <div
        style={{
          width: bodyWidth,
          height: bodyHeight,
          marginTop: mark * 0.08,
          borderTopLeftRadius: bodyHeight,
          borderTopRightRadius: bodyHeight,
          background: BACKGROUND_COLOR,
        }}
      />
    </div>
  );
}
