import { dailyPlayerQueue, parseDailyPlayerInfos } from "../daily-player-model.js";

export function registerDailyPlayback(r) {
  r.$getDailyPlayerState = function getDailyPlayerState(control = null) {
    if (location.hostname !== "daily.bandcamp.com") return null;
    const source = document.querySelector("#p-daily-article[data-player-infos]");
    const infos = parseDailyPlayerInfos(source?.getAttribute("data-player-infos"));
    if (!infos.length) return null;
    const requestedPlayer = control?.closest?.(".mplayer[id^='daily-player-']") || null;
    const activePlayer = requestedPlayer
      || document.querySelector(".mplayer.playing[id^='daily-player-'], .mplayer:not(.idle)[id^='daily-player-']")
      || document.querySelector(".mplayer[id^='daily-player-']");
    const playerId = activePlayer?.id?.replace(/^daily-player-/, "") || "";
    const info = infos.find((candidate) => String(candidate.player_id || candidate.tralbum_key || "") === playerId)
      || infos[0];
    const queue = dailyPlayerQueue(info);
    if (!queue.length) return null;
    const requestedRow = control?.closest?.(".trtrack") || null;
    const playingRow = activePlayer?.querySelector(".trtrack.playing") || null;
    const row = requestedRow || playingRow;
    const rows = activePlayer ? [...activePlayer.querySelectorAll(".trtrack")] : [];
    const rowIndex = row ? rows.indexOf(row) : -1;
    const displayedNumber = Number(activePlayer?.querySelector(".mptracknumber")?.textContent) || 0;
    const featuredIndex = Math.max(0, Number(info.featured_track_number) - 1 || 0);
    const index = Math.max(0, Math.min(queue.length - 1,
      rowIndex >= 0 ? rowIndex : displayedNumber > 0 ? displayedNumber - 1 : featuredIndex));
    const audio = r.$getAudio();
    return {
      player: activePlayer,
      queue,
      index,
      track: queue[index],
      currentTime: Number(audio?.currentTime) || 0,
      duration: Number(audio?.duration) || queue[index]?.duration || 0,
      isPlaying: Boolean(activePlayer?.classList.contains("playing") || (audio && !audio.paused && !audio.ended))
    };
  };
}

export const registerDailyPlaybackRuntime = [registerDailyPlayback];
