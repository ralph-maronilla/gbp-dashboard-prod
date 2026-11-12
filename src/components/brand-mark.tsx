import Image from "next/image";
import logo from "@/assets/logo.png";

/** The app's logo (decorative: the brand name is always written beside it). */
export function BrandMark({ size = 36 }: { size?: number }) {
  return <Image src={logo} alt="" aria-hidden width={size} height={size} priority style={{ flexShrink: 0 }} />;
}
