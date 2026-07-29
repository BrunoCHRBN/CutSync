const feedbackEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeClientSupportFeedbackEmail = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return feedbackEmailPattern.test(email) ? email : null;
};

export const getClientSupportFeedbackEmail = () => (
  normalizeClientSupportFeedbackEmail(
    process.env.EXPO_PUBLIC_SUPPORT_FEEDBACK_EMAIL,
  )
);

export const buildClientSupportFeedbackMailto = (email: string) => {
  const normalizedEmail = normalizeClientSupportFeedbackEmail(email);
  if (!normalizedEmail) return null;
  const subject = encodeURIComponent('Sugestão de melhoria para o CutSync');
  const body = encodeURIComponent(
    'Olá! Gostaria de compartilhar a seguinte sugestão de melhoria para o CutSync:\n\n',
  );
  return `mailto:${normalizedEmail}?subject=${subject}&body=${body}`;
};
