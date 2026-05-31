use pest::Parser;
use pest_derive::Parser;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Parser)]
#[grammar = "query/query.pest"]
pub struct QueryParser;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Query {
    pub metric: String,
    pub filters: Vec<Filter>,
    pub aggregator: Option<Aggregator>,
    pub group_by: Vec<String>,
    pub time_range: Option<TimeRange>,
    pub step: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Filter {
    pub label: String,
    pub operator: FilterOperator,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FilterOperator {
    Equal,
    NotEqual,
    RegexMatch,
    RegexNotMatch,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Aggregator {
    Sum,
    Avg,
    Min,
    Max,
    Count,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeRange {
    pub start: String,
    pub end: Option<String>,
}

pub fn parse_query(input: &str) -> Result<Query, String> {
    let mut pairs = QueryParser::parse(Rule::query, input)
        .map_err(|e| format!("Parse error: {}", e))?;

    let query_pair = pairs.next().ok_or("No query found")?;
    parse_query_pair(query_pair)
}

fn parse_query_pair(pair: pest::iterators::Pair<Rule>) -> Result<Query, String> {
    let mut metric = String::new();
    let mut filters = Vec::new();
    let mut aggregator = None;
    let mut group_by = Vec::new();
    let mut time_range = None;
    let mut step = None;

    for inner in pair.into_inner() {
        match inner.as_rule() {
            Rule::metric => {
                metric = inner.as_str().to_string();
            }
            Rule::filter_list => {
                for filter_pair in inner.into_inner() {
                    if filter_pair.as_rule() == Rule::filter {
                        filters.push(parse_filter(filter_pair)?);
                    }
                }
            }
            Rule::aggregator_part => {
                let (agg, group) = parse_aggregator_part(inner)?;
                aggregator = Some(agg);
                group_by = group;
            }
            Rule::time_range => {
                time_range = Some(parse_time_range(inner)?);
            }
            Rule::step => {
                step = Some(inner.as_str().to_string());
            }
            _ => {}
        }
    }

    Ok(Query {
        metric,
        filters,
        aggregator,
        group_by,
        time_range,
        step,
    })
}

fn parse_aggregator_part(pair: pest::iterators::Pair<Rule>) -> Result<(Aggregator, Vec<String>), String> {
    let mut aggregator = Aggregator::Sum;
    let mut group_by = Vec::new();
    let mut inner_metric = None;

    for inner in pair.into_inner() {
        match inner.as_rule() {
            Rule::aggregator => {
                aggregator = parse_aggregator(inner)?;
            }
            Rule::metric => {
                inner_metric = Some(inner.as_str().to_string());
            }
            Rule::group_by_list => {
                for label_pair in inner.into_inner() {
                    if label_pair.as_rule() == Rule::label_name {
                        group_by.push(label_pair.as_str().to_string());
                    }
                }
            }
            _ => {}
        }
    }

    Ok((aggregator, group_by))
}

fn parse_filter(pair: pest::iterators::Pair<Rule>) -> Result<Filter, String> {
    let mut label = String::new();
    let mut operator = FilterOperator::Equal;
    let mut value = String::new();

    for inner in pair.into_inner() {
        match inner.as_rule() {
            Rule::label_name => {
                label = inner.as_str().to_string();
            }
            Rule::filter_op => {
                operator = match inner.as_str() {
                    "=" => FilterOperator::Equal,
                    "!=" => FilterOperator::NotEqual,
                    "=~" => FilterOperator::RegexMatch,
                    "!~" => FilterOperator::RegexNotMatch,
                    _ => return Err(format!("Unknown operator: {}", inner.as_str())),
                };
            }
            Rule::label_value => {
                value = inner.as_str().trim_matches('"').to_string();
            }
            _ => {}
        }
    }

    Ok(Filter {
        label,
        operator,
        value,
    })
}

fn parse_aggregator(pair: pest::iterators::Pair<Rule>) -> Result<Aggregator, String> {
    let aggregator_str = pair.as_str().to_lowercase();
    match aggregator_str.as_str() {
        "sum" => Ok(Aggregator::Sum),
        "avg" => Ok(Aggregator::Avg),
        "min" => Ok(Aggregator::Min),
        "max" => Ok(Aggregator::Max),
        "count" => Ok(Aggregator::Count),
        _ => Err(format!("Unknown aggregator: {}", aggregator_str)),
    }
}

fn parse_time_range(pair: pest::iterators::Pair<Rule>) -> Result<TimeRange, String> {
    let mut start = String::new();
    let mut end = None;

    for inner in pair.into_inner() {
        match inner.as_rule() {
            Rule::time_value => {
                if start.is_empty() {
                    start = inner.as_str().to_string();
                } else {
                    end = Some(inner.as_str().to_string());
                }
            }
            _ => {}
        }
    }

    Ok(TimeRange { start, end })
}

pub fn translate_to_promql(query: &Query) -> String {
    let mut result = String::new();

    if let Some(agg) = &query.aggregator {
        let agg_str = match agg {
            Aggregator::Sum => "sum",
            Aggregator::Avg => "avg",
            Aggregator::Min => "min",
            Aggregator::Max => "max",
            Aggregator::Count => "count",
        };
        result.push_str(&format!("{}(", agg_str));
    }

    result.push_str(&query.metric);

    if !query.filters.is_empty() {
        result.push('{');
        let filter_strs: Vec<String> = query
            .filters
            .iter()
            .map(|f| {
                let op = match f.operator {
                    FilterOperator::Equal => "=",
                    FilterOperator::NotEqual => "!=",
                    FilterOperator::RegexMatch => "=~",
                    FilterOperator::RegexNotMatch => "!~",
                };
                format!("{}{}\"{}\"", f.label, op, f.value)
            })
            .collect();
        result.push_str(&filter_strs.join(","));
        result.push('}');
    }

    if let Some(agg) = &query.aggregator {
        result.push(')');
        if !query.group_by.is_empty() {
            result.push_str(&format!(" by ({})", query.group_by.join(", ")));
        }
    }

    if let Some(tr) = &query.time_range {
        if let Some(end) = &tr.end {
            result.push_str(&format!("[{}:{}]", tr.start, end));
        } else {
            result.push_str(&format!("[{}]", tr.start));
        }
    }

    result
}

pub fn translate_to_influxql(query: &Query) -> String {
    let mut select_clause = String::from("SELECT ");
    
    let field_expr = if let Some(agg) = &query.aggregator {
        match agg {
            Aggregator::Sum => format!("SUM(value)"),
            Aggregator::Avg => format!("MEAN(value)"),
            Aggregator::Min => format!("MIN(value)"),
            Aggregator::Max => format!("MAX(value)"),
            Aggregator::Count => format!("COUNT(value)"),
        }
    } else {
        "value".to_string()
    };
    
    select_clause.push_str(&field_expr);
    select_clause.push_str(&format!(" FROM {}", query.metric));

    let mut where_clauses = Vec::new();
    
    for filter in &query.filters {
        let op = match filter.operator {
            FilterOperator::Equal => "=",
            FilterOperator::NotEqual => "!=",
            FilterOperator::RegexMatch => "=~",
            FilterOperator::RegexNotMatch => "!~",
        };
        where_clauses.push(format!("\"{}\" {} '{}'", filter.label, op, filter.value));
    }

    if let Some(tr) = &query.time_range {
        where_clauses.push(format!("time > now() - {}", tr.start));
    }

    if !where_clauses.is_empty() {
        select_clause.push_str(" WHERE ");
        select_clause.push_str(&where_clauses.join(" AND "));
    }

    let mut group_by_parts = vec!["time(1m)".to_string()];
    if !query.group_by.is_empty() {
        group_by_parts.extend(query.group_by.clone());
    }
    
    select_clause.push_str(&format!(" GROUP BY {} ORDER BY time DESC", group_by_parts.join(", ")));

    select_clause
}

pub fn translate_to_flux(query: &Query) -> String {
    let mut flux = String::new();
    
    flux.push_str(&format!(r#"from(bucket: "default")"#));
    flux.push_str(" |> range(start: ");
    
    if let Some(tr) = &query.time_range {
        flux.push_str(&format!("-{}", tr.start));
    } else {
        flux.push_str("-1h");
    }
    flux.push(')');
    
    flux.push_str(&format!(" |> filter(fn: (r) => r._measurement == \"{}\"", query.metric));
    
    for filter in &query.filters {
        let op = match filter.operator {
            FilterOperator::Equal => "==",
            FilterOperator::NotEqual => "!=",
            FilterOperator::RegexMatch => "=~",
            FilterOperator::RegexNotMatch => "!~",
        };
        flux.push_str(&format!(" and r.{} {} \"{}\"", filter.label, op, filter.value));
    }
    flux.push(')');
    
    flux.push_str(" |> filter(fn: (r) => r._field == \"value\")");
    
    if let Some(agg) = &query.aggregator {
        let agg_fn = match agg {
            Aggregator::Sum => "sum",
            Aggregator::Avg => "mean",
            Aggregator::Min => "min",
            Aggregator::Max => "max",
            Aggregator::Count => "count",
        };
        
        if !query.group_by.is_empty() {
            flux.push_str(&format!(
                " |> {}(columns: [\"_value\"], by: [{}])",
                agg_fn,
                query.group_by.iter().map(|g| format!("\"{}\"", g)).collect::<Vec<_>>().join(", ")
            ));
        } else {
            flux.push_str(&format!(" |> {}(columns: [\"_value\"])", agg_fn));
        }
    }
    
    flux.push_str(" |> sort(columns: [\"_time\"], desc: true)");
    
    flux
}

pub fn translate_to_sql(query: &Query) -> String {
    let mut select_clause = String::from("SELECT ");
    
    let time_expr = "time_bucket('1 minute', time) as bucket";
    let value_expr = if let Some(agg) = &query.aggregator {
        match agg {
            Aggregator::Sum => "SUM(value)",
            Aggregator::Avg => "AVG(value)",
            Aggregator::Min => "MIN(value)",
            Aggregator::Max => "MAX(value)",
            Aggregator::Count => "COUNT(value)",
        }
    } else {
        "value"
    };
    
    let mut select_parts = vec![time_expr.to_string(), value_expr.to_string()];
    select_parts.extend(query.group_by.clone());
    select_clause.push_str(&select_parts.join(", "));
    select_clause.push_str(&format!(" FROM {} ", query.metric));

    let mut where_clauses = Vec::new();
    
    for filter in &query.filters {
        let op = match filter.operator {
            FilterOperator::Equal => "=",
            FilterOperator::NotEqual => "!=",
            FilterOperator::RegexMatch => "~",
            FilterOperator::RegexNotMatch => "!~",
        };
        where_clauses.push(format!("\"{}\" {} '{}'", filter.label, op, filter.value));
    }

    if let Some(tr) = &query.time_range {
        where_clauses.push(format!("time > NOW() - INTERVAL '{}'", tr.start));
    }

    if !where_clauses.is_empty() {
        select_clause.push_str("WHERE ");
        select_clause.push_str(&where_clauses.join(" AND "));
        select_clause.push(' ');
    }

    let mut group_by_parts = vec!["bucket".to_string()];
    group_by_parts.extend(query.group_by.clone());
    
    select_clause.push_str(&format!("GROUP BY {} ORDER BY bucket DESC", group_by_parts.join(", ")));

    select_clause
}
