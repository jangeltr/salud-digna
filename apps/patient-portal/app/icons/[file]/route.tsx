import { ImageResponse } from "next/og";
import { AppMark } from "../mark";

// Iconos del manifiesto. Se generan en la compilación, sin archivos binarios en el repositorio.
const icons: Record<string, { size: number; scale: number }> = {
  "icon-192.png": { size: 192, scale: 0.62 },
  "icon-512.png": { size: 512, scale: 0.62 },
  "icon-maskable-512.png": { size: 512, scale: 0.48 },
};

export function generateStaticParams() {
  return Object.keys(icons).map((file) => ({ file }));
}

export async function GET(_request: Request, { params }: RouteContext<"/icons/[file]">) {
  const { file } = await params;
  if (!Object.hasOwn(icons, file)) {
    return new Response(null, { status: 404 });
  }

  const { size, scale } = icons[file];
  return new ImageResponse(<AppMark size={size} scale={scale} />, { width: size, height: size });
}
