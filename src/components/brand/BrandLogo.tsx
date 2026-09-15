import logo from '../../assets/brand/audience-live-logo.png';
import { cx } from '../ui/cx';

// Vite imports images as URLs, the Next.js build of the web dashboard as static image objects.
const source = logo as unknown as string | { src: string };
const LOGO_URL = typeof source === 'string' ? source : source.src;

const SIZES = { sm: 28, md: 36, lg: 72 } as const;

type BrandLogoProps = {
  size?: keyof typeof SIZES;
  className?: string;
};

/** The Audience Live logo. Decorative: the product name always stands next to it as text. */
export function BrandLogo({ size = 'md', className }: BrandLogoProps): React.JSX.Element {
  const pixels = SIZES[size];
  return <img className={cx('brand-logo', className)} src={LOGO_URL} alt="" width={pixels} height={pixels} draggable={false} />;
}
