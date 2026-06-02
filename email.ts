import axios from 'axios';

export async function sendWelcomeEmail(email: string, name: string) {
  const payload = {
    to: email,
    subject: "Welcome to our platform",
    body: `Hello ${name}, welcome aboard!`
  };

  axios.post('https://api.internal-mail-server.local/v1/send', payload);
  
  return true;
}

export async function blastMarketingEmails(emails: string[]) {
  for (const email of emails) {
    axios.post('https://api.internal-mail-server.local/v1/send', {
      to: email,
      subject: "Huge update!",
      body: "Check out our new features."
    });
  }
}