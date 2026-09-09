# Fyll Storefront Domain Launch

This is the launch plan for the public storefront on `fyll.store`.

## Domain structure

- `fyll.app` = Fyll operations app
- `fyll.store` = discovery homepage
- `business.fyll.store` = each business storefront

## Recommended launch pattern

- Launch discovery on `https://fyll.store`
- Launch each merchant on `https://{slug}.fyll.store`
- Keep `https://fyll.store/{slug}` as a discovery/profile fallback if needed

## Vercel setup

1. Create a new Vercel project for storefront only.
2. Add the production domain `fyll.store`.
3. Add the wildcard domain `*.fyll.store`.
4. Set the storefront project as the only public project connected to `fyll.store`.

## Namecheap DNS / nameserver setup

Because wildcard domains on Vercel use nameserver verification, point the domain to Vercel nameservers from Namecheap.

1. Open Namecheap for `fyll.store`.
2. Go to `Domain` > `Nameservers`.
3. Change from Namecheap BasicDNS to custom nameservers.
4. Paste the Vercel nameservers shown in the Vercel domain settings.
5. Save and wait for propagation.

## After nameservers switch

Add back any records that should continue to exist inside Vercel DNS, for example:

- email records
- verification TXT records
- any future custom records

## Merchant setup inside Fyll

Each business should have:

- `storefrontEnabled = true`
- `storefrontSlug = business handle`
- optional `storefrontCustomDomain` for future upgrades

Example:

- Business name: Mint Eyewear
- Slug: `mint`
- Live storefront: `https://mint.fyll.store`
- Discovery page: `https://fyll.store/mint`

## First launch checklist

- Vercel storefront project created
- `fyll.store` added to Vercel
- `*.fyll.store` added to Vercel
- Namecheap nameservers switched to Vercel
- storefront homepage published on `fyll.store`
- one test merchant published on `business.fyll.store`
- QR code updated to the final merchant subdomain
