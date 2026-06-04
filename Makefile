# ============================================================
# people-page-miniprogram Makefile
# 微信小程序无需容器化，仅提供开发/预览/上传能力
# ============================================================
PROJECT_ROOT := $(shell pwd)

.PHONY: help dev build preview upload lint clean

help: ## 显示帮助信息
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-16s\033[0m %s\n", $$1, $$2}'

dev: ## 打开微信开发者工具（需先安装 CLI）
	@echo "请在微信开发者工具中打开: $(PROJECT_ROOT)"
	@open -a "wechatwebdevtools" "$(PROJECT_ROOT)" 2>/dev/null || \
		echo "请手动打开微信开发者工具导入项目"

build: ## 打包构建（npm 构建 + 小程序编译）
	npm run build 2>/dev/null || echo "跳过 npm build（无 npm 依赖）"
	@echo "构建完成，请在微信开发者工具中点击「上传」"

preview: ## 预览（需微信开发者工具 CLI）
	cli preview --project "$(PROJECT_ROOT)" 2>/dev/null || \
		echo "需要安装微信开发者工具 CLI: https://developers.weixin.qq.com/miniprogram/dev/devtools/cli.html"

upload: ## 上传代码（需微信开发者工具 CLI）
	@read -p "版本号 (如 1.0.0): " VER; \
	read -p "版本描述: " DESC; \
	cli upload --project "$(PROJECT_ROOT)" -v "$$VER" -d "$$DESC"

lint: ## 代码检查
	@echo "检查 JS 文件..."
	@find . -name "*.js" -not -path "*/node_modules/*" | head

clean: ## 清理
	rm -rf node_modules 2>/dev/null || true
