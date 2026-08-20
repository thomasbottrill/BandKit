import assert from "node:assert/strict";
import fs from "node:fs";
import { readContentSource, readHubStyles } from "./support/source.mjs";

const source = readContentSource();
const css = readHubStyles();

assert.match(source, /musicBarWidth:\s*"default"/, "Music bar width must default to the standard 800px layout");
assert.match(source, /\["default", "Default \(800 px\)"\]/, "Settings must expose the default music bar width");
assert.match(source, /\["tight", "Tight \(640 px\)"\]/, "Settings must expose a tight music bar width");
assert.match(source, /\["wide", "Wide \(1120 px\)"\]/, "Settings must expose a wide music bar width");
assert.match(source, /\["full", "Full width"\]/, "Settings must expose a full-width music bar option");
assert.match(source, /\["custom", "Custom"\]/, "Settings must expose an exact custom music bar width");
assert.match(source, /customMusicBarWidth\.type = "number"/, "Custom width must use a numeric input");
assert.match(source, /customMusicBarWidth\.min = "480"/, "Custom width must enforce a usable minimum");
assert.match(source, /customMusicBarWidth\.max = "2000"/, "Custom width must cap extreme values");
assert.match(source, /hub-settings-paired-controls[\s\S]*?musicBarSizeField[\s\S]*?musicBarWidthField/, "Music bar size and width must share one compact settings row");
assert.match(source, /if \(tab\.id === "playlist"\) continue;/, "The combined Now Playing and Playlists section must occupy one music-bar slot");
assert.match(source, /showingSavedPlaylists \? "icon-playlist\.svg" : "icon-now-playing\.svg"/, "The combined music-bar slot must reflect its last active inner tab");
assert.match(source, /const currentPanelVisible = state\.open && state\.activeTab === "playlist";[\s\S]*?state\.activeTab = "playlist";[\s\S]*?state\.open = !currentPanelVisible;/, "The combined music-bar slot must reopen the last active inner tab");
assert.match(source, /showingSavedCarts \? "icon-saved-cart\.svg" : "icon-cart\.svg"/, "The cart music-bar slot must reflect its last active inner tab");
assert.match(source, /showingSavedCarts \? state\.savedCarts\.length : state\.cart\.length/, "The cart music-bar count must reflect its last active inner tab");
assert.doesNotMatch(source, /function toggleSectionPanel\(tabId\)[\s\S]{0,300}state\.cartView\s*=/, "The shared cart music-bar slot must reopen the last active inner tab");
assert.ok(fs.existsSync(new URL("../assets/icon-saved-cart.svg", import.meta.url)), "The saved-cart music-bar state must have a dedicated icon");
assert.match(source, /player\.dataset\.contentWidth = width/, "Saved width selection must reach the player layout");
assert.match(source, /hub-player-tools[\s\S]*?hub-dj-player-button[\s\S]*?hub-player-more-wrap/, "DJ tools must appear before More actions in the music bar");
assert.doesNotMatch(css, /\.hub-player\.is-compact \.hub-player-content\s*\{[^}]*max-width:\s*none/s, "Compact mode must not override the standard default width");
assert.match(css, /data-content-width="tight"[^}]*max-width:\s*640px/s, "Tight width must cap player content at 640px");
assert.match(css, /data-content-width="wide"[^}]*width:\s*min\(1120px/s, "Wide width must cap player content at 1120px");
assert.match(css, /data-content-width="wide"[^}]*margin-left:\s*auto;[^}]*margin-right:\s*auto/s, "Wide width must remain centred");
assert.match(css, /data-content-width="full"[^}]*width:\s*calc\(100%/s, "Full width must use the available player span");
assert.match(css, /data-content-width="custom"[^}]*var\(--hub-player-custom-width, 900px\)/s, "Custom width must reach the player content rule");
assert.match(css, /\.hub-settings-select\s*\{[^}]*appearance:\s*none;[^}]*background-position:\s*right 18px center, right 13px center/s, "Settings combobox chevrons must sit comfortably inside the right edge");
assert.match(css, /\.hub-settings-paired-controls\s*\{[^}]*display:\s*flex;/s, "The paired music bar controls must remain on one line");
assert.match(css, /\.hub-player\.is-compact \.hub-player-tools\s*\{[^}]*grid-area:\s*tools;[^}]*grid-column:\s*tools;/s,
  "Empty compact players must keep overflow and DJ controls in the named right-side tools column");
assert.match(css, /@media \(max-width:\s*1120px\)\s*\{[\s\S]*?\.hub-player-content,[\s\S]*?data-content-width="full"[\s\S]*?\.hub-player-content\s*\{[^}]*margin-left:\s*0;[^}]*margin-right:\s*0;[^}]*max-width:\s*none;[^}]*width:\s*calc\(100% - var\(--hub-sections-panel-width,[^;]+\) - 24px\);/,
  "Restricted desktop widths must left-anchor playback and reserve the real panel-launcher width");
assert.match(css, /@media \(max-width:\s*1120px\)[\s\S]*?\.hub-player-content,[\s\S]*?\.hub-player-content\s*\{[^}]*box-sizing:\s*border-box;[^}]*padding-left:\s*12px;/,
  "Restricted desktop widths must keep playback controls clear of the viewport edge");
assert.doesNotMatch(css, /@media \(max-width:\s*1120px\)[\s\S]{0,220}calc\(100% - 704px\)/,
  "Restricted desktop widths must not collapse the playback area around the old fixed reservation");
assert.match(css, /\.hub-player-more-button\s*\{[^}]*border:\s*1px solid transparent;[^}]*color:\s*var\(--hub-accent\);/s,
  "The Ellipsis control must share the DJ button's borderless resting treatment");
assert.match(css, /\.hub-dj-player-button\s*\{[^}]*border:\s*1px solid transparent;/s,
  "The DJ control must not show an outline until interaction");
assert.match(css, /\.hub-player-more-button:hover:not\(:disabled\),[\s\S]*?background:\s*var\(--hub-accent-soft\);[\s\S]*?border-color:\s*var\(--hub-accent\);/,
  "The Ellipsis control must reveal its outline and soft fill on hover, focus, or open");
assert.match(css, /\.hub-dj-player-button:hover,[\s\S]*?background:\s*var\(--hub-accent-soft\);[\s\S]*?border-color:\s*var\(--hub-accent\);/,
  "The DJ control must reveal its outline and soft fill on hover or focus");
assert.match(css, /\.hub-player-more-menu \.hub-queue-action\.is-labeled\s*\{[^}]*background:\s*transparent;[^}]*border-color:\s*transparent;[^}]*border-radius:\s*3px;/s,
  "Overflow actions must render as menu rows rather than outlined buttons");
assert.match(css, /\.hub-player-more-menu\s*\{[^}]*background:\s*var\(--hub-card\);[^}]*border:\s*1px solid var\(--hub-line\);[^}]*box-shadow:[^}]*color:\s*var\(--hub-ink\);/s,
  "The music-bar ellipsis menu must use the themed card surface, boundary, shadow, and foreground");
assert.match(css, /\.hub-playlist-destination-menu\s*\{[^}]*background:\s*var\(--hub-card\);[^}]*border:\s*1px solid var\(--hub-line\);[^}]*color:\s*var\(--hub-ink\);/s,
  "Add-to submenus must use the same themed menu surface and foreground");
assert.match(css, /\.hub-toolbar-actions-menu\s*\{[^}]*background:\s*var\(--hub-card\);[^}]*border:\s*1px solid var\(--hub-line\);[^}]*color:\s*var\(--hub-ink\);/s,
  "Panel toolbar ellipsis menus must use the same themed menu surface and foreground");
assert.doesNotMatch(css, /var\(--hub-text\)/, "Menus must not depend on the retired hub text token");
assert.match(css, /\.hub-player-more-menu \.hub-queue-action\.is-labeled:hover:not\(:disabled\),[\s\S]*?background:\s*var\(--hub-accent-soft\);[\s\S]*?border-color:\s*transparent;/,
  "Overflow menu rows must retain a clear hover and keyboard-focus state without an outline");
assert.match(css, /\.hub-player-more-menu \.hub-playlist-destination-menu\s*\{[^}]*bottom:\s*auto;[^}]*left:\s*calc\(100% \+ 6px\);[^}]*right:\s*auto;[^}]*top:\s*-6px;/s,
  "Music-bar submenus must open to the right with their top edges aligned by default");
assert.match(css, /\.hub-player-more-menu \.hub-playlist-destination-menu\.opens-left\s*\{[^}]*left:\s*auto;[^}]*right:\s*calc\(100% \+ 6px\);/s,
  "Music-bar submenus must support a left-opening fallback");
assert.match(source, /const availableRight = window\.innerWidth - parentBounds\.right;[\s\S]*?classList\.toggle\("opens-left", availableRight < submenuWidth \+ 14\);/,
  "Music-bar submenus must flip left only when there is not enough viewport room on the right");
assert.match(source, /const showView = \(nextView\) => \{[\s\S]*?populatePlaylistDestinationMenu\(menu, trigger, track, nextView\);[\s\S]*?menu\.querySelector\("\.hub-playlist-menu-option"\)\?\.focus\(\);/,
  "Nested music-bar destinations must receive focus synchronously before the outer menu can close");
assert.match(source, /hub-player-more-wrap"\)\.addEventListener\("focusout",[\s\S]*?}, 50\)\);/,
  "The music-bar menu must allow nested destination focus to settle before closing");
assert.match(source, /createTrackActionControls\(track, \{ labeled: true, playlistsOnly: true, hideCart \}\)/,
  "The music-bar overflow must open playlists directly instead of duplicating Now Playing and cart destinations");
assert.match(source, /playlistsOnly \? "Add to playlist" : "Add"/,
  "The music-bar overflow must label its focused action Add to playlist");
assert.match(source, /playlistsOnly \? "playlists-only" : "destinations"/,
  "The music-bar Add to playlist action must bypass the generic destination menu");

console.log("Music bar width layout checks passed.");
