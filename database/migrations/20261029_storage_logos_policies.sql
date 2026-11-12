-- Migration: Enable public access and upload for logos bucket in Supabase storage

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Access Logos'
  ) THEN
    CREATE POLICY "Public Access Logos" ON storage.objects FOR SELECT USING (bucket_id = 'logos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Allow Upload Logos'
  ) THEN
    CREATE POLICY "Allow Upload Logos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'logos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Allow Update Logos'
  ) THEN
    CREATE POLICY "Allow Update Logos" ON storage.objects FOR UPDATE USING (bucket_id = 'logos');
  END IF;
END $$;

