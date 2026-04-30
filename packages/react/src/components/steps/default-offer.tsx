import type { ReactElement } from 'react'
import type { OfferStepProps } from '../../core/types'
import { DefaultContactOffer } from './offer/default-contact-offer'
import { DefaultDiscountOffer } from './offer/default-discount-offer'
import { DefaultPauseOffer } from './offer/default-pause-offer'
import { DefaultPlanChangeOffer } from './offer/default-plan-change-offer'
import { DefaultRedirectOffer } from './offer/default-redirect-offer'
import { DefaultTrialExtensionOffer } from './offer/default-trial-extension-offer'

// Routes to the per-type component, which owns its full canvas. Two
// override seams: replace one type via `components.PauseOffer` (etc.), or
// take over the whole offer step via the `Offer` slot.
export function DefaultOffer(props: OfferStepProps) {
  const { offer, components } = props
  const Component = pickOfferComponent(offer.type, components)
  // Custom offer types are dispatched upstream against `customComponents`,
  // so an unknown type reaching this switcher is bad data.
  if (!Component) return null
  return (
    <Component
      // Remount on offer change so per-type selection state (pause months,
      // plan id) doesn't leak across reason switches.
      key={offer.decisionId ?? offer.type}
      {...props}
    />
  )
}

function pickOfferComponent(
  type: string,
  components: OfferStepProps['components'],
): ((props: OfferStepProps) => ReactElement) | null {
  switch (type) {
    case 'discount':
      return components?.DiscountOffer ?? DefaultDiscountOffer
    case 'pause':
      return components?.PauseOffer ?? DefaultPauseOffer
    case 'trial_extension':
      return components?.TrialExtensionOffer ?? DefaultTrialExtensionOffer
    case 'plan_change':
      return components?.PlanChangeOffer ?? DefaultPlanChangeOffer
    case 'contact':
      return components?.ContactOffer ?? DefaultContactOffer
    case 'redirect':
      return components?.RedirectOffer ?? DefaultRedirectOffer
    default:
      return null
  }
}
