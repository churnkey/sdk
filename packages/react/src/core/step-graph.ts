// Steps are a graph, not an array. Mirrors the embed's Blueprint model
// (churnkey-embed/src/models/Blueprint.ts). Each step has a guid and two
// pointer fields — defaultNextStep, defaultPreviousStep — set once at build
// and never mutated. Survey steps additionally carry offersAttached, a
// reasonId → synthetic-offer-step-guid map.
//
// Survey-choice offers are their own steps, not a mutable slot. That keeps
// the current offer readable as stepMap[currentStepId].offer — one source
// of truth for "what offer is on screen?".
//
// The graph is immutable after build. Local mode builds in the machine
// constructor; token mode defers until initializeFromEmbed has the
// transformed blueprint.

import type {
  ConfirmStep,
  CustomStepConfig,
  FeedbackStep,
  OfferConfig,
  OfferDecision,
  OfferStep,
  ReasonConfig,
  Step,
  SuccessStep,
  SurveyStep,
} from './types'

export interface ResolvedStep {
  guid: string
  type: string
  defaultNextStep?: string
  defaultPreviousStep?: string
  title?: string
  description?: string

  // survey
  reasons?: ReasonConfig[]
  offersAttached?: Record<string, string>
  numChoices?: number

  // offer
  offer?: OfferDecision
  /** True if this step was synthesized from a survey choice. Used by stepIndex so synthetic offers share the survey's progress slot. */
  surveyOffer?: boolean

  // feedback
  placeholder?: string
  required?: boolean
  minLength?: number

  // success
  savedTitle?: string
  savedDescription?: string
  cancelledTitle?: string
  cancelledDescription?: string

  // custom
  data?: Record<string, unknown>

  classNames?: unknown
}

export interface StepGraph {
  stepMap: Record<string, ResolvedStep>
  /** Entry point. */
  firstStepId: string
  /** Developer-declared steps in declaration order. Synthetic offer steps are NOT included — they live in stepMap only. Drives progress UI. */
  orderedStepIds: string[]
  /** Cached for O(1) lookup. Undefined if the flow has no survey step. */
  surveyStepId?: string
}

const EMPTY_GRAPH: StepGraph = { stepMap: {}, firstStepId: '', orderedStepIds: [] }

export function buildStepGraph(
  steps: Step[],
  defaultOfferCopy: (offer: OfferConfig) => OfferDecision['copy'],
): StepGraph {
  if (steps.length === 0) return EMPTY_GRAPH

  const resolved = steps.map((step, i) => normalizeStep(step, i))
  linkNeighbors(resolved)

  const stepMap: Record<string, ResolvedStep> = {}
  for (const step of resolved) stepMap[step.guid] = step

  // Only the first survey in the declared order gets its choice offers wired.
  // Multiple surveys per flow is legal but unusual; the second+ behave as
  // plain steps. If this becomes a real pattern, wire them all.
  const surveyStep = resolved.find((s) => s.type === 'survey')
  if (surveyStep?.reasons) {
    surveyStep.offersAttached = {}
    for (const reason of surveyStep.reasons) {
      if (!reason.offer) continue
      const offerGuid = `${surveyStep.guid}:offer:${reason.id}`
      stepMap[offerGuid] = {
        guid: offerGuid,
        type: 'offer',
        surveyOffer: true,
        offer: toDecision(reason.offer, defaultOfferCopy),
        // Decline/next from the synthetic offer skips the survey entirely;
        // back returns to the survey so the user can pick a different reason.
        defaultNextStep: surveyStep.defaultNextStep,
        defaultPreviousStep: surveyStep.guid,
      }
      surveyStep.offersAttached[reason.id] = offerGuid
    }
  }

  return {
    stepMap,
    firstStepId: resolved[0].guid,
    orderedStepIds: resolved.map((s) => s.guid),
    surveyStepId: surveyStep?.guid,
  }
}

function normalizeStep(step: Step, index: number): ResolvedStep {
  // Prefer a developer-declared guid (token mode preserves blueprint guids
  // so analytics joins line up). Fall back to a stable slug for local mode.
  const guid = (step as { guid?: string }).guid ?? `step-${index}-${step.type}`
  const base: ResolvedStep = { guid, type: step.type }

  switch (step.type) {
    case 'survey': {
      const s = step as SurveyStep
      return {
        ...base,
        title: s.title,
        description: s.description,
        reasons: s.reasons,
        numChoices: s.reasons.length,
        classNames: s.classNames,
      }
    }
    case 'offer': {
      const s = step as OfferStep
      return {
        ...base,
        title: s.title,
        description: s.description,
        offer: s.offer,
        classNames: s.classNames,
      }
    }
    case 'feedback': {
      const s = step as FeedbackStep
      return {
        ...base,
        title: s.title,
        description: s.description,
        placeholder: s.placeholder,
        required: s.required,
        minLength: s.minLength,
        classNames: s.classNames,
      }
    }
    case 'confirm': {
      const s = step as ConfirmStep
      return {
        ...base,
        title: s.title,
        description: s.description,
        classNames: s.classNames,
      }
    }
    case 'success': {
      const s = step as SuccessStep
      return {
        ...base,
        savedTitle: s.savedTitle,
        savedDescription: s.savedDescription,
        cancelledTitle: s.cancelledTitle,
        cancelledDescription: s.cancelledDescription,
        classNames: s.classNames,
      }
    }
    default: {
      const s = step as CustomStepConfig
      return {
        ...base,
        title: s.title,
        description: s.description,
        data: s.data,
      }
    }
  }
}

function linkNeighbors(steps: ResolvedStep[]): void {
  for (let i = 0; i < steps.length; i++) {
    if (i < steps.length - 1) steps[i].defaultNextStep = steps[i + 1].guid
    if (i > 0) steps[i].defaultPreviousStep = steps[i - 1].guid
  }
}

function toDecision(offer: OfferConfig, defaultCopy: (o: OfferConfig) => OfferDecision['copy']): OfferDecision {
  return 'copy' in offer ? (offer as OfferDecision) : { ...offer, copy: defaultCopy(offer) }
}
