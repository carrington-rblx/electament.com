# AmentAmour for President — electament.com

A responsive, single-page campaign website built with semantic HTML, Tailwind CSS (CDN), and lightweight vanilla JavaScript.

## Preview locally

Open `index.html` in a browser, or run a local static server:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Included

- Responsive desktop and mobile navigation
- Campaign hero and email/ZIP/phone signup forms
- Campaign overview, biography, rally feature, and social update cards
- Interactive donation amount selection (demo only)
- Volunteer signup form (demo only)
- Dismissible endorsement card and accessible campaign-video placeholder dialog
- Inline SVG campaign flag branding

## Before publishing

This repository contains a front-end template. The forms do not send or store submissions, and the donation UI does not process payments. Before launch:

1. Replace the stock photo placeholders with approved candidate and campaign photography.
2. Verify all biography, policy, and campaign claims against official records.
3. Connect signup forms to an approved campaign CRM, including required consent, privacy, and opt-out handling.
4. Connect the donation flow to the campaign's authorized payment processor; do not collect contributions until the committee's compliance setup is complete.
5. Have campaign counsel/compliance staff add the committee's exact FEC-required disclaimer and registration details, and publish a real privacy policy.
6. Replace social links and placeholder updates with official campaign channels and approved content.

## Deployment

The site is a static page and can be published with GitHub Pages: in the repository settings, open **Pages**, select **Deploy from a branch**, choose **main** and **/(root)**, then save. A custom domain can be configured there after DNS is prepared.

For production, consider compiling Tailwind into a static CSS file rather than relying on the CDN runtime.
