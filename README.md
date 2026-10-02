# JobSpace

Workspace pribadi untuk mengelola proses pencarian kerja: lamaran, peluang, perusahaan, wawancara, tugas, follow-up, dokumen, dan analitik.

## Teknologi

- Next.js App Router dan React dengan TypeScript
- Tailwind CSS, komponen shadcn/ui, Sonner, dan Meya Icons
- Neon PostgreSQL untuk data aplikasi dan file dokumen
- Cloudflare Workers melalui OpenNext; Hyperdrive untuk koneksi database

## Menjalankan secara lokal

Gunakan Node.js 22 atau versi LTS yang kompatibel dan npm.

```sh
npm ci
```

Salin `.env.example` menjadi `.env.local`, lalu isi `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, dan `AUTH_SECRET` dengan konfigurasi milik Anda. Jangan unggah file `.env.local` ke GitHub.

```sh
npm run db:migrate
npm run dev
```

Buka `http://localhost:3000`. Pendaftaran dan login tersedia di `/login`.

## Pemeriksaan

```sh
npm run typecheck
npm test
```

## Deploy ke Cloudflare

Gunakan akun Cloudflare dan database Neon milik Anda. Sesuaikan binding Hyperdrive pada `wrangler.jsonc`, lalu tambahkan `AUTH_SECRET` sebagai Worker secret. Detail tersedia di [CLOUDFLARE_DEPLOYMENT.md](./CLOUDFLARE_DEPLOYMENT.md).

```sh
npx wrangler login
npm run deploy
```

Kode sumber di repo ini tidak mencakup kredensial, database lokal, file unggahan pribadi, atau hasil build.
