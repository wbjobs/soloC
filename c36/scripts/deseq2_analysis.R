#!/usr/bin/env Rscript

library(argparse)
library(jsonlite)

parser <- ArgumentParser(description="差异表达分析 (DESeq2 或 limma)")
parser$add_argument("--expression", required=TRUE, help="表达矩阵 CSV 文件路径")
parser$add_argument("--groups", required=TRUE, help="分组信息 CSV 文件路径")
parser$add_argument("--output", required=TRUE, help="输出结果目录路径")
parser$add_argument("--mode", default="pairwise", help="分析模式: pairwise (两两比较) 或 multi (多组比较)")

args <- parser$parse_args()

expr_data <- read.csv(args$expression, row.names=1, check.names=FALSE, 
                      stringsAsFactors=FALSE, quote='"', sep=",")
group_data <- read.csv(args$groups, row.names=1, check.names=FALSE,
                       stringsAsFactors=FALSE, quote='"', sep=",")

common_samples <- intersect(colnames(expr_data), rownames(group_data))
if (length(common_samples) == 0) {
    stop("表达矩阵和分组信息没有共同的样本名称")
}

expr_data <- expr_data[, common_samples]
group_data <- group_data[common_samples, , drop=FALSE]

group_col <- colnames(group_data)[1]
groups <- factor(group_data[[group_col]])
unique_groups <- unique(groups)

if (length(unique_groups) < 2) {
    stop("分组信息至少需要两个不同的组别")
}

group_counts <- table(groups)
min_replicates <- min(group_counts)

cat("样本分组情况:\n")
print(group_counts)
cat("最小重复数:", min_replicates, "\n")
cat("组别:", paste(unique_groups, collapse=", "), "\n")

run_deseq2_pair <- function(group1, group2) {
    library(DESeq2)
    
    selected_samples <- rownames(group_data)[groups %in% c(group1, group2)]
    expr_subset <- expr_data[, selected_samples]
    groups_subset <- factor(groups[selected_samples], levels=c(group1, group2))
    
    colData <- data.frame(group = groups_subset)
    rownames(colData) <- selected_samples
    
    dds <- DESeqDataSetFromMatrix(
        countData = round(expr_subset),
        colData = colData,
        design = ~ group
    )
    
    dds <- DESeq(dds, quiet=TRUE)
    
    contrast_name <- resultsNames(dds)[2]
    res <- results(dds, name=contrast_name)
    
    res_df <- as.data.frame(res)
    res_df$gene <- rownames(res_df)
    res_df <- res_df[, c("gene", "log2FoldChange", "pvalue", "padj")]
    res_df <- res_df[complete.cases(res_df), ]
    res_df <- res_df[order(res_df$gene), ]
    
    return(res_df)
}

run_limma_pair <- function(group1, group2) {
    library(limma)
    
    selected_samples <- rownames(group_data)[groups %in% c(group1, group2)]
    expr_subset <- expr_data[, selected_samples]
    groups_subset <- factor(groups[selected_samples], levels=c(group1, group2))
    
    expr_matrix <- as.matrix(expr_subset)
    expr_matrix <- log2(expr_matrix + 1)
    
    design <- model.matrix(~ groups_subset)
    colnames(design) <- c("Intercept", "group_effect")
    
    fit <- lmFit(expr_matrix, design)
    fit <- eBayes(fit)
    
    res_df <- topTable(fit, coef=2, adjust="fdr", number=Inf)
    res_df$gene <- rownames(res_df)
    
    res_df <- res_df[, c("gene", "logFC", "P.Value", "adj.P.Val")]
    colnames(res_df) <- c("gene", "log2FoldChange", "pvalue", "padj")
    res_df <- res_df[complete.cases(res_df), ]
    res_df <- res_df[order(res_df$gene), ]
    
    return(res_df)
}

perform_comparison <- function(group1, group2) {
    comparison_name <- paste0(group2, "_vs_", group1)
    cat("正在比较:", comparison_name, "\n")
    
    group1_samples <- sum(groups == group1)
    group2_samples <- sum(groups == group2)
    current_min_rep <- min(group1_samples, group2_samples)
    
    result <- NULL
    method_used <- "unknown"
    
    if (current_min_rep >= 3) {
        result <- tryCatch({
            res <- run_deseq2_pair(group1, group2)
            method_used <<- "DESeq2"
            res
        }, error = function(e) {
            cat("DESeq2 失败:", e$message, ", 使用 limma\n")
            NULL
        })
    }
    
    if (is.null(result)) {
        result <- run_limma_pair(group1, group2)
        method_used <- "limma"
    }
    
    return(list(
        name = comparison_name,
        group1 = group1,
        group2 = group2,
        method = method_used,
        data = result,
        significant_genes = result$gene[abs(result$log2FoldChange) > 1 & result$padj < 0.05]
    ))
}

results <- list()

if (length(unique_groups) == 2) {
    comparison <- perform_comparison(as.character(unique_groups[1]), as.character(unique_groups[2]))
    results[[comparison$name]] <- comparison
} else {
    for (i in 1:(length(unique_groups)-1)) {
        for (j in (i+1):length(unique_groups)) {
            group1 <- as.character(unique_groups[i])
            group2 <- as.character(unique_groups[j])
            comparison <- perform_comparison(group1, group2)
            results[[comparison$name]] <- comparison
        }
    }
}

output_dir <- args$output
dir.create(output_dir, showWarnings=FALSE, recursive=TRUE)

all_genes_list <- list()
summary_data <- list()

for (comp_name in names(results)) {
    comp <- results[[comp_name]]
    csv_file <- file.path(output_dir, paste0(comp_name, ".csv"))
    write.csv(comp$data, csv_file, row.names=FALSE, quote=TRUE, fileEncoding="UTF-8")
    
    all_genes_list[[comp_name]] <- as.character(comp$significant_genes)
    
    summary_data[[comp_name]] <- list(
        group1 = comp$group1,
        group2 = comp$group2,
        method = comp$method,
        total_genes = nrow(comp$data),
        significant_count = length(comp$significant_genes),
        csv_file = basename(csv_file)
    )
}

venn_data <- list(
    comparisons = names(all_genes_list),
    gene_sets = all_genes_list,
    summary = summary_data
)

json_file <- file.path(output_dir, "analysis_results.json")
write_json(venn_data, json_file, pretty=TRUE, auto_unbox=TRUE)

cat("\n分析完成！\n")
cat("共完成", length(results), "组比较\n")
for (comp_name in names(results)) {
    comp <- results[[comp_name]]
    cat("  -", comp_name, "(", comp$method, "):", length(comp$significant_genes), "显著基因\n")
}
cat("结果已保存到:", output_dir, "\n")
