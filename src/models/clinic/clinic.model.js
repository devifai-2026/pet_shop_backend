import mongoose from "mongoose";

const serviceTypes = [
  "Basic Bath & Dry",
  "Full Body Bath",
  "Hair Trimming Package",
  "Full Grooming Package",
  "Spa & De-Shedding Package",
  "Nail Clipping & Ear Cleaning",
  "Paw & Hygiene Care",
  "Others",
];

const clinicAppointmentSchema = new mongoose.Schema(
  {
    // Patient Information
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
    },
    mobileNumber: {
      type: String,
      required: [true, "Mobile number is required"],
      trim: true,
      match: [/^[0-9]{10}$/, "Please enter a valid 10-digit mobile number"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      match: [/.+\@.+\..+/, "Please enter a valid email"],
    },

    // Appointment Details
    serviceType: {
      type: String,
      required: [true, "Service type is required"],
      enum: {
        values: serviceTypes,
        message: "{VALUE} is not a valid service type",
      },
    },
    preferredDate: {
      type: Date,
      required: [true, "Preferred date is required"],
      validate: {
        validator: function (value) {
          return value > Date.now();
        },
        message: "Preferred date must be in the future",
      },
    },

    // System Fields
    status: {
      type: String,
      enum: ["pending", "confirmed", "completed", "cancelled"],
      default: "pending",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better query performance
clinicAppointmentSchema.index({ preferredDate: 1 });
clinicAppointmentSchema.index({ status: 1 });
clinicAppointmentSchema.index({ email: 1 });

// Virtual for formatted date
clinicAppointmentSchema.virtual("formattedDate").get(function () {
  return this.preferredDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
});

// Pre-save validation for date
clinicAppointmentSchema.pre("save", function (next) {
  // Ensure preferredDate is a Date object
  if (this.preferredDate && typeof this.preferredDate === "string") {
    this.preferredDate = new Date(this.preferredDate);
  }
  next();
});

const ClinicAppointment = mongoose.model(
  "ClinicAppointment",
  clinicAppointmentSchema
);

export default ClinicAppointment;
