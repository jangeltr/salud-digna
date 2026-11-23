import { ImageResponse } from "next/og";
import { AppMark } from "./icons/mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<AppMark size={size.width} scale={0.56} />, size);
}
