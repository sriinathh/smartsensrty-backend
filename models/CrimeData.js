/**
 * Crime Data Model - Real-time crime incident data
 */

const mongoose = require('mongoose');

const crimeDataSchema = new mongoose.Schema(
  {
    incidentId: {
      type: String,
      unique: true,
      default: () => `crime_${Date.now()}`,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
      address: String,
      neighborhood: String,
      city: String,
      state: String,
      zipCode: String,
    },
    incidentType: {
      type: String,
      enum: [
        'assault',
        'robbery',
        'theft',
        'burglary',
        'homicide',
        'rape',
        'arson',
        'vandalism',
        'drug_offense',
        'traffic_incident',
        'other',
      ],
      required: true,
      index: true,
    },
    severity: {
      type: Number,
      min: 0,
      max: 1.0,
      required: true,
      // 0.0-0.3: low, 0.3-0.7: moderate, 0.7-1.0: high
    },
    reportedTime: {
      type: Date,
      required: true,
      index: true,
    },
    occurredTime: {
      type: Date,
      sparse: true,
    },
    resolvedAt: Date,
    status: {
      type: String,
      enum: ['reported', 'investigating', 'resolved', 'closed'],
      default: 'reported',
    },
    description: String,
    victim: {
      type: {
        type: String,
        enum: ['individual', 'property', 'other'],
      },
      count: Number,
      injuries: {
        type: Number,
        default: 0,
      },
    },
    witnessCount: {
      type: Number,
      default: 0,
    },
    caseNumber: String,
    policeDistrict: String,
    respondingDepartment: String,
    officerAssigned: String,
    source: {
      type: String,
      enum: ['police_report', 'public_database', 'citizen_report', 'news'],
      default: 'police_report',
    },
    dataQuality: {
      type: Number,
      min: 0,
      max: 1.0,
      default: 0.7,
      // Score based on source reliability and data completeness
    },
    relatedIncidents: [
      {
        incidentId: String,
        distance: Number, // meters
        timeWindow: Number, // milliseconds
      },
    ],
    hotspots: {
      isPartOfHotspot: Boolean,
      hotspotId: String,
      hotspotRadius: Number,
    },
    environmentalFactors: {
      lighting: {
        type: String,
        enum: ['dark', 'poorly_lit', 'lit', 'well_lit'],
        sparse: true,
      },
      weather: String,
      timeOfDay: String,
      populated: {
        type: String,
        enum: ['isolated', 'less_populated', 'populated', 'crowded'],
      },
    },
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      // Calculated based on severity, frequency, recency
    },
    tags: [String],
    notes: String,
    dataExpiresAt: {
      type: Date,
      // Crime data older than 90 days has lower weight
      default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Geospatial index for location-based queries
crimeDataSchema.index({ 'location.coordinates': '2dsphere' });
crimeDataSchema.index({ reportedTime: 1 });
crimeDataSchema.index({ incidentType: 1 });
crimeDataSchema.index({ severity: 1 });
crimeDataSchema.index({ riskScore: 1 });

// TTL index to auto-delete old records
crimeDataSchema.index({ dataExpiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('CrimeData', crimeDataSchema);
