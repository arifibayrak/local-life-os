#!/bin/bash
# Launches the Qwen MLX model server (used by the LaunchAgent).
export PATH="/opt/anaconda3/bin:/usr/local/bin:/usr/bin:/bin"
exec mlx_lm.server --model mlx-community/Qwen3.5-9B-MLX-4bit --port 8088
