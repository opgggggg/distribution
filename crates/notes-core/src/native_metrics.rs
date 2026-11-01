//! Bounded timing aggregates for native QA. No document contents or input coordinates.
use serde_json::{json, Value};
use std::collections::VecDeque;
const WINDOW: usize = 512;
const NAMES: [&str; 12] = [
    "inputBatchMs",
    "rasterMs",
    "frameIntervalMs",
    "presentationMs",
    "saveMs",
    "stateMs",
    "baseRasterMs",
    "inkRasterMs",
    "inputBeginMs",
    "inputAppendMs",
    "inputCommitMs",
    "uiRefreshMs",
];
#[derive(Default)]
struct Samples {
    window: VecDeque<f64>,
    count: u64,
    total: f64,
    max: f64,
    over33: u64,
    over100: u64,
}
pub struct Metrics {
    channels: [Samples; 12],
}
impl Default for Metrics {
    fn default() -> Self {
        Self {
            channels: std::array::from_fn(|_| Samples {
                window: VecDeque::with_capacity(WINDOW),
                ..Samples::default()
            }),
        }
    }
}
impl Metrics {
    pub fn record(&mut self, kind: u32, ms: f64) -> bool {
        if !ms.is_finite() || !(0.0..=60000.0).contains(&ms) {
            return false;
        }
        let Some(s) = self.channels.get_mut(kind as usize) else {
            return false;
        };
        s.count += 1;
        s.total += ms;
        s.max = s.max.max(ms);
        s.over33 += u64::from(ms > 33.0);
        s.over100 += u64::from(ms > 100.0);
        if s.window.len() == WINDOW {
            s.window.pop_front();
        }
        s.window.push_back(ms);
        true
    }
    pub fn value(&self) -> Value {
        let mut map = serde_json::Map::new();
        for (name, s) in NAMES.iter().zip(&self.channels) {
            let mut window = s.window.iter().copied().collect::<Vec<_>>();
            window.sort_by(f64::total_cmp);
            let q = |p: f64| {
                if window.is_empty() {
                    None
                } else {
                    Some(window[((window.len() as f64 * p).ceil() as usize).saturating_sub(1)])
                }
            };
            map.insert((*name).into(),json!({"count":s.count,"windowCount":window.len(),"mean":if s.count==0{None}else{Some(s.total/s.count as f64)},"p50":q(0.5),"p95":q(0.95),"p99":q(0.99),"max":s.max,"over33ms":s.over33,"over100ms":s.over100}));
        }
        json!({"version":1,"windowCapacity":WINDOW,"quantiles":"recent-window-nearest-rank","channels":map})
    }
}
