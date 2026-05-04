// URLs to deep-link into WhatsApp / SMS from any browser, used by the
// athlete page text-a-workout buttons and the coach text-an-athlete
// button.
//
// `https://wa.me/<digits>` is the cross-platform way to start a
// WhatsApp chat — it opens the WhatsApp app on iOS/Android if
// installed, web.whatsapp.com otherwise. Bare `whatsapp://send` is
// proprietary and doesn't fall back gracefully on desktop browsers.
//
// `sms:` is left as a fallback for teams that haven't switched their
// Twilio number to the WhatsApp channel — those teams still use
// classic SMS and athletes' default messaging app is the right place
// for them to log workouts.

/** Strip whatsapp:/sms: scheme + non-digits, leaving only the E.164 digits.
 *  '+1 234 567' or 'whatsapp:+12345' → '12345'. Returns '' on bad input. */
export function digitsOnly(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/^(whatsapp|sms):/i, '').replace(/\D/g, '');
}

/** True if the team's twilio config indicates the WhatsApp channel
 *  (number stored as 'whatsapp:+E164'). */
export function teamUsesWhatsApp(twilioPhoneNumber: string | null | undefined): boolean {
  return !!twilioPhoneNumber && twilioPhoneNumber.toLowerCase().startsWith('whatsapp:');
}

/** Build a deep-link to start a chat with a given phone. Picks WhatsApp
 *  for teams on the WhatsApp channel, SMS otherwise. Optional prefill
 *  text seeds the message body so an athlete tapping "Text a workout"
 *  lands in the chat with "Workout: " already typed. */
export function chatHrefForTeamNumber(
  teamTwilioPhone: string | null | undefined,
  prefill?: string,
): string | null {
  if (!teamTwilioPhone) return null;
  const digits = digitsOnly(teamTwilioPhone);
  if (!digits) return null;
  if (teamUsesWhatsApp(teamTwilioPhone)) {
    const qs = prefill ? `?text=${encodeURIComponent(prefill)}` : '';
    return `https://wa.me/${digits}${qs}`;
  }
  // SMS fallback. The body= query param works on iOS/Android.
  const sep = prefill ? `?&body=${encodeURIComponent(prefill)}` : '';
  return `sms:+${digits}${sep}`;
}

/** Build a deep-link for messaging a person directly (e.g. a coach
 *  texting one athlete). WhatsApp is the universal default — works
 *  across countries, doesn't depend on iMessage availability, and
 *  matches the channel the team's Twilio bot is on (so the athlete
 *  reads coach + bot messages in the same app). */
export function chatHrefForPerson(personPhone: string | null | undefined): string | null {
  const digits = digitsOnly(personPhone);
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}
