import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function clearStuckJobs() {
  const jobIds = [
    '43770abd-33fc-4988-a854-d52a26dd4a72',
    '174e0e45-52dd-48d9-b7fa-cbdc3686a92b'
  ];

  const { error } = await supabase
    .from('backfill_jobs')
    .delete()
    .in('id', jobIds);

  if (error) {
    console.error('Error deleting jobs:', error);
  } else {
    console.log('✓ Successfully deleted 2 stuck backfill jobs');
  }
}

clearStuckJobs();
