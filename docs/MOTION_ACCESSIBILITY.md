# Motion accessibility

The Sensory control is keyboard-operable and offers Motion System/Full/Reduced, Sound Off/On, and Mascot Helpful/Minimal. Preferences persist locally outside life history. System follows `prefers-reduced-motion`; Reduced always wins; Full is an explicit override.

Reduced mode keeps immediate state correctness, source/destination labels, selection, hierarchy, semantic result copy, and exact history. Large translation, route zoom, shared flight, and mascot body motion are replaced by short crossfades/local outlines. Sound is also suppressed in reduced sensory mode. The application remains complete with motion, sound, and mascot response absent.

The calendar timeline, individual events, and Breathing Room consume the same live application preference as the shell. They must not use an OS-only hook that ignores the user's in-app Reduced setting. Integration and production stress coverage verify changing this setting reaches those feature owners immediately.

Controls retain semantic names, visible focus, minimum target sizes, and normal DOM reading order. Reward layers and transition clones are pointer-events-none and aria-hidden. State is never color-only: labels, icons, geometry, attributes, and concise result text remain. The command surface stays mounted across worlds; route changes do not trap or erase focus; browser Back stays available.

Nonessential presentation can be interrupted by a new command, Escape/cancel, navigation, undo/redo, hiding the tab, or changing preferences. There is no parallax, full-screen zoom, shaking, flashing, autoplay audio, or looping ambient movement.
