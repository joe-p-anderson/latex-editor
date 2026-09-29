"""Schematic x-t, v-t and a-t graphs for field work 2.

An object moving in one direction under a constant opposing force: it slows,
stops, turns around, and comes back. The graphs are schematic -- shapes only,
no numbers on the axes -- because the sheet asks students what the *shape* of
the motion is, and putting values on the axes answers a question they have not
been asked yet.

Units are chosen so the turnaround happens at t = 1; nothing about that number
reaches the figure.

    python scripts/fw2_motiongraph.py

writes Images/fw2_motiongraph.pdf. Run it from 1200/latex/ (or anywhere -- the
default output path is resolved relative to this file, not the shell's cwd).
"""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

# Turnaround at t = 1, with initial speed and acceleration both 1. Running to
# 2.4 carries the object back past its starting point, so the x-t parabola
# reads as a full there-and-back rather than as a hill that stops at the top.
T_TURN = 1.0
T_END = 2.4

LINE = "#1a1a1a"
GUIDE = "#9a9a9a"


def motion(t: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Position, velocity and acceleration for constant a = -1, v(0) = +1."""
    x = t - 0.5 * t**2
    v = 1.0 - t
    a = np.full_like(t, -1.0)
    return x, v, a


def style_axes(ax) -> None:
    """Bare schematic axes: a t-axis at zero, a value axis, no numbers."""
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["bottom"].set_visible(False)
    ax.spines["left"].set_position(("data", 0.0))
    ax.spines["left"].set_linewidth(0.9)
    ax.spines["left"].set_color(LINE)

    ax.set_xticks([])
    ax.set_yticks([])
    ax.set_xlim(-0.08 * T_END, T_END * 1.06)

    # The horizontal axis is drawn as a line at y = 0 rather than as the bottom
    # spine, so that on the v-t and a-t panels it sits where zero actually is
    # -- the sign change in v is the whole story, and it needs a zero to change
    # sign about.
    ax.axhline(0.0, color=LINE, linewidth=0.9, zorder=1)


def label_axis_tips(ax, ylabel: str, tlabel: str | None) -> None:
    """Name the axes at their tips, the way the axes get labelled by hand.

    Anchored to the tips rather than to `set_ylabel`, whose default position is
    the middle of the panel -- which on these graphs is exactly where the t-axis
    runs.
    """
    ax.text(
        0.0,
        ax.get_ylim()[1],
        ylabel,
        transform=ax.get_yaxis_transform(which="grid"),
        ha="right",
        va="top",
        fontsize=13,
        clip_on=False,
    )
    if tlabel is not None:
        ax.text(
            ax.get_xlim()[1],
            0.0,
            tlabel,
            ha="right",
            va="top",
            fontsize=13,
            clip_on=False,
        )


def build_figure() -> plt.Figure:
    t = np.linspace(0.0, T_END, 400)
    x, v, a = motion(t)

    # a-t is a single flat line and needs less room than the other two.
    fig, axes = plt.subplots(
        1, 3, figsize=(4.6, 2.0), gridspec_kw={"width_ratios": [1, 1, 0.7]}
    )
    ax_x, ax_v, ax_a = axes

    for ax, series in zip(axes, (x, v, a)):
        ax.plot(t, series, color=LINE, linewidth=2.0, zorder=3, clip_on=False)
        style_axes(ax)

    # A little headroom above and below each curve, so nothing touches a panel
    # edge. On a-t the zero line is what needs the clearance, not the curve.
    ax_x.set_ylim(min(x) - 0.25, max(x) + 0.30)
    ax_v.set_ylim(min(v) - 0.35, max(v) + 0.35)
    ax_a.set_ylim(-1.6, 0.55)

    # The turnaround: apex of x-t, zero crossing of v-t, nothing at all on a-t.
    # Carrying one guide line through all three panels is the point of the
    # figure -- it is the same instant in each.
    # for ax in axes:
    #     ax.axvline(T_TURN, color=GUIDE, linewidth=0.8, linestyle=(0, (4, 3)), zorder=2)

    for ax, ylabel in zip(axes, ("$x$", "$v$", "$a$")):
        label_axis_tips(ax, ylabel, "$t$" if ax is ax_a else None)

    # ax_x.annotate(
    #     "turns around",
    #     xy=(T_TURN, max(x)),
    #     xytext=(T_TURN + 0.10, max(x) + 0.10),
    #     fontsize=10,
    #     color=GUIDE,
    #     ha="left",
    #     va="bottom",
    # )
    ax_v.plot([T_TURN], [0.0], marker="o", markersize=4.5, color=LINE, zorder=4)

    fig.subplots_adjust(left=0.10, right=0.97, top=0.97, bottom=0.04, hspace=0.30)
    return fig


def main() -> None:
    default_out = Path(__file__).resolve().parent.parent / "Images" / "fw2_motiongraph.png"

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "-o",
        "--out",
        type=Path,
        default=default_out,
        help=f"output file (default: {default_out})",
    )
    parser.add_argument("--show", action="store_true", help="open a window instead of writing")
    args = parser.parse_args()

    plt.rcParams.update({"font.family": "serif", "mathtext.fontset": "cm"})
    fig = build_figure()

    plt.show()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(args.out)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
