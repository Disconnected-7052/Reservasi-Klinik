export const typeDefs = `
enum AppointmentStatus {
  BOOKED
  CANCELLED
  COMPLETED
}

type Doctor {
  id: ID!
  name: String!
  specialty: String!
  room: String!
  days: [Int!]!
}

type Slot {
  time: String!
  available: Boolean!
}

type Appointment {
  id: ID!
  patientId: ID!
  patientName: String!
  doctorId: ID!
  doctorName: String!
  specialty: String!
  room: String!
  date: String!
  slot: String!
  status: AppointmentStatus!
  complaint: String
  note: String
  createdAt: String!
}

input BookingInput {
  doctorId: ID!
  date: String!
  slot: String!
  complaint: String
}

type Query {
  doctors(specialty: String): [Doctor!]!
  doctor(id: ID!): Doctor
  availability(doctorId: ID!, date: String!): [Slot!]!
  appointments(status: AppointmentStatus): [Appointment!]!
  appointment(id: ID!): Appointment
}

type Mutation {
  bookAppointment(input: BookingInput!): Appointment!
  cancelAppointment(id: ID!): Appointment!
  completeAppointment(id: ID!, note: String!): Appointment!
}
`
