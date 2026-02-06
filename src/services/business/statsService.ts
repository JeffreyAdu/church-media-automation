/**
 * Stats Service
 * Business logic for dashboard statistics
 */

import { countAllEpisodes, countEpisodesByUserId } from "../../repositories/episodeRepository.js";
import { supabase } from "../../config/supabase.js";

export interface DashboardStats {
  totalAgents: number;
  totalEpisodes: number;
}

/**
 * Get dashboard statistics for a user
 */
export async function getUserDashboardStats(userId: string): Promise<DashboardStats> {
  // Count agents for this user
  const { count: agentCount, error: agentError } = await supabase
    .from("agents")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (agentError) {
    throw new Error(`Failed to count agents: ${agentError.message}`);
  }

  // Count episodes for this user
  const episodeCount = await countEpisodesByUserId(userId);

  return {
    totalAgents: agentCount || 0,
    totalEpisodes: episodeCount,
  };
}
