import restaurantLogo from '../../imports/res.png';
import restaurantLogoOnWhite from '../../imports/res1.png';
import retailLogo from '../../imports/ret.png';
import retailLogoOnWhite from '../../imports/ret1.png';

type DefaultStoreLogoSurface = 'default' | 'white';

export function getDefaultStoreLogo(storeType?: string | null, surface: DefaultStoreLogoSurface = 'default') {
  if (storeType === 'RETAIL_STORE') {
    return surface === 'white' ? retailLogoOnWhite : retailLogo;
  }

  return surface === 'white' ? restaurantLogoOnWhite : restaurantLogo;
}

export function getStoreLogoForWhiteBackground(logo?: string | null, storeType?: string | null) {
  const defaultLogo = getDefaultStoreLogo(storeType);

  if (!logo || logo === defaultLogo) {
    return getDefaultStoreLogo(storeType, 'white');
  }

  return logo;
}
