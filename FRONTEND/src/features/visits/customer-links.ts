/**
 * Plain links for the quick actions on customer cards: call the number, or get directions in Google Maps.
 * No plugin: the phone hands tel: links to its dialer and the maps link to the Maps app or the browser.
 */

const ARABIC_DIGITS = /[٠-٩]/g

/** tel: link for a phone number as it was typed (spaces, dashes and brackets dropped); null without one. */
export function telHref(phone: string | null | undefined): string | null {
  const western = (phone ?? '').replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))
  const digits = western.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '')
  return /\d{3,}/.test(digits) ? `tel:${digits}` : null
}

export interface MapTarget {
  lat?: number | null
  lng?: number | null
  address?: string | null
  townName?: string | null
}

const DIRECTIONS = 'https://www.google.com/maps/dir/?api=1&destination='

/** Directions to the saved location, or to the address (with its town) when there are no coordinates. */
export function mapsHref(place: MapTarget): string | null {
  const { lat, lng } = place
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `${DIRECTIONS}${lat},${lng}`
  }
  const address = [place.address, place.townName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ')
  return address ? `${DIRECTIONS}${encodeURIComponent(address)}` : null
}
