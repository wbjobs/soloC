package com.gameanalytics.controller;

import com.gameanalytics.model.BehaviorAggregate;
import com.gameanalytics.service.BehaviorAggregationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/aggregate")
@CrossOrigin(origins = "*")
public class AggregationController {

    private final BehaviorAggregationService aggregationService;

    public AggregationController(BehaviorAggregationService aggregationService) {
        this.aggregationService = aggregationService;
    }

    @GetMapping("/server/{serverId}")
    public ResponseEntity<List<BehaviorAggregate>> getAggregateByServer(
            @PathVariable String serverId,
            @RequestParam(defaultValue = "24") int hours) {
        return ResponseEntity.ok(aggregationService.getAggregateDataByServer(serverId, hours));
    }

    @GetMapping("/map/{mapId}")
    public ResponseEntity<List<BehaviorAggregate>> getAggregateByMap(
            @PathVariable String mapId,
            @RequestParam(defaultValue = "24") int hours) {
        return ResponseEntity.ok(aggregationService.getAggregateDataByMap(mapId, hours));
    }

    @GetMapping("/comparison/servers")
    public ResponseEntity<Map<String, Object>> getServerComparison(
            @RequestParam List<String> servers,
            @RequestParam(defaultValue = "24") int hours) {
        return ResponseEntity.ok(aggregationService.getComparisonData(servers, hours));
    }

    @GetMapping("/comparison/levels")
    public ResponseEntity<Map<String, Object>> getLevelComparison(
            @RequestParam List<Integer> levels,
            @RequestParam(defaultValue = "24") int hours) {
        return ResponseEntity.ok(aggregationService.getLevelComparisonData(levels, hours));
    }

    @PostMapping("/force")
    public ResponseEntity<Void> forceAggregation(@RequestParam(defaultValue = "24") int hours) {
        aggregationService.forceAggregation(hours);
        return ResponseEntity.ok().build();
    }
}
