import { useCancelFlow } from '@churnkey/react/headless'

export function App() {
  const flow = useCancelFlow({
    steps: [
      {
        type: 'survey',
        title: 'Why are you leaving?',
        reasons: [
          {
            id: 'expensive',
            label: 'Too expensive',
            offer: { type: 'discount', percent: 20, months: 3 },
          },
          {
            id: 'not-using',
            label: 'Not using it enough',
            offer: { type: 'pause', months: 2 },
          },
          { id: 'missing', label: 'Missing features' },
          { id: 'other', label: 'Other' },
        ],
      },
      { type: 'feedback', title: 'Anything else we should know?' },
      { type: 'confirm', title: 'Confirm cancellation' },
    ],
    onAccept: async (offer) => {
      console.log('Accepted:', offer)
      // Simulate async work
      await new Promise((r) => setTimeout(r, 1000))
    },
    onCancel: async () => {
      console.log('Cancelled')
      await new Promise((r) => setTimeout(r, 1000))
    },
    onClose: () => {
      console.log('Closed')
    },
  })

  return (
    <div style={{ maxWidth: 480, margin: '100px auto', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Churnkey SDK Playground</h1>
      <p style={{ color: '#666', marginBottom: 32 }}>
        Step: <strong>{flow.step}</strong> ({flow.stepIndex + 1}/{flow.totalSteps})
      </p>

      {flow.error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          Error: {flow.error.message}
        </div>
      )}

      {flow.step === 'survey' && (
        <div>
          <h2 style={{ fontSize: 20, marginBottom: 16 }}>Why are you leaving?</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {flow.reasons.map((r) => (
              <button
                key={r.id}
                onClick={() => flow.selectReason(r.id)}
                style={{
                  display: 'block',
                  textAlign: 'left',
                  padding: '12px 16px',
                  border: `2px solid ${flow.selectedReason === r.id ? '#6366f1' : '#e5e7eb'}`,
                  borderRadius: 12,
                  background: flow.selectedReason === r.id ? '#eef2ff' : 'white',
                  cursor: 'pointer',
                  fontSize: 15,
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={flow.next}
            disabled={!flow.selectedReason}
            style={{
              marginTop: 16,
              width: '100%',
              padding: '12px 16px',
              background: flow.selectedReason ? '#6366f1' : '#d1d5db',
              color: 'white',
              border: 'none',
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              cursor: flow.selectedReason ? 'pointer' : 'not-allowed',
            }}
          >
            Continue
          </button>
        </div>
      )}

      {flow.step === 'offer' && flow.recommendation && (
        <div>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>{flow.recommendation.copy.headline}</h2>
          <p style={{ color: '#666', marginBottom: 24 }}>{flow.recommendation.copy.body}</p>
          <button
            onClick={flow.accept}
            disabled={flow.isProcessing}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              opacity: flow.isProcessing ? 0.7 : 1,
            }}
          >
            {flow.isProcessing ? 'Processing...' : flow.recommendation.copy.cta}
          </button>
          <button
            onClick={flow.decline}
            style={{
              display: 'block',
              margin: '12px auto 0',
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            {flow.recommendation.copy.declineCta}
          </button>
        </div>
      )}

      {flow.step === 'feedback' && (
        <div>
          <h2 style={{ fontSize: 20, marginBottom: 16 }}>Anything else we should know?</h2>
          <textarea
            value={flow.feedback}
            onChange={(e) => flow.setFeedback(e.target.value)}
            placeholder="Your feedback helps us improve..."
            style={{
              width: '100%',
              minHeight: 120,
              padding: 12,
              border: '2px solid #e5e7eb',
              borderRadius: 12,
              fontSize: 15,
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              onClick={flow.back}
              style={{
                padding: '12px 16px',
                background: 'white',
                border: '2px solid #e5e7eb',
                borderRadius: 12,
                fontSize: 15,
                cursor: 'pointer',
              }}
            >
              Back
            </button>
            <button
              onClick={flow.next}
              style={{
                flex: 1,
                padding: '12px 16px',
                background: '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {flow.step === 'confirm' && (
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>Confirm cancellation</h2>
          <p style={{ color: '#666', marginBottom: 24 }}>
            Your access continues until the end of your billing period.
          </p>
          <button
            onClick={flow.cancel}
            disabled={flow.isProcessing}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              opacity: flow.isProcessing ? 0.7 : 1,
            }}
          >
            {flow.isProcessing ? 'Processing...' : 'Cancel subscription'}
          </button>
          <button
            onClick={flow.back}
            style={{
              display: 'block',
              margin: '12px auto 0',
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Go back
          </button>
        </div>
      )}

      {flow.step === 'success' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>
            {flow.outcome === 'saved' ? '🎉' : '👋'}
          </div>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>
            {flow.outcome === 'saved' ? 'Welcome back!' : 'Subscription cancelled'}
          </h2>
          <p style={{ color: '#666' }}>
            {flow.outcome === 'saved'
              ? 'Your offer has been applied.'
              : 'We\'re sorry to see you go.'}
          </p>
        </div>
      )}

      <details style={{ marginTop: 48, color: '#999', fontSize: 12 }}>
        <summary style={{ cursor: 'pointer' }}>Debug state</summary>
        <pre style={{ marginTop: 8, background: '#f9fafb', padding: 12, borderRadius: 8, overflow: 'auto' }}>
          {JSON.stringify(
            {
              step: flow.step,
              selectedReason: flow.selectedReason,
              recommendation: flow.recommendation,
              feedback: flow.feedback,
              outcome: flow.outcome,
              isProcessing: flow.isProcessing,
              error: flow.error?.message,
              stepIndex: flow.stepIndex,
              totalSteps: flow.totalSteps,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </div>
  )
}
